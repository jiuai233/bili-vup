import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456', 
};

const poolConfig = {
  ...dbConfig,
  database: process.env.DB_NAME || 'bilibili_data', 
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true 
};

let pool;

export async function initMySQL() {
  try {
    console.log("[DB] 正在初始化 MySQL 并建立 5 层建筑表结构 (通过环境变量配置)...");
    
    const connection = await mysql.createConnection(dbConfig);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${poolConfig.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.end();

    pool = mysql.createPool(poolConfig);

    // 1. users 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bili_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 初始化默认管理员
    const initialUser = process.env.DEFAULT_ADMIN_USER || 'admin';
    const initialPass = process.env.DEFAULT_ADMIN_PASS || '123456';
    const [userRows] = await pool.query('SELECT * FROM bili_users WHERE username = ?', [initialUser]);
    if (userRows.length === 0) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(initialPass, salt);
        await pool.query('INSERT INTO bili_users (username, password_hash) VALUES (?, ?)', [initialUser, hash]);
        console.log(`[DB] 成功创建默认管理员账号: ${initialUser}`);
    }

    // 2. system_config 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bili_system_config (
          config_key VARCHAR(100) PRIMARY KEY,
          config_value TEXT NOT NULL,
          description VARCHAR(255),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    // 初始化默认配置
    await pool.query('INSERT IGNORE INTO bili_system_config (config_key, config_value, description) VALUES (?, ?, ?)', ['bili_cookie', '', 'B站API爬取所需Cookie']);
    await pool.query('INSERT IGNORE INTO bili_system_config (config_key, config_value, description) VALUES (?, ?, ?)', ['min_fans_limit', '2000', '只抓取粉丝数大于此值的主播']);
    await pool.query('INSERT IGNORE INTO bili_system_config (config_key, config_value, description) VALUES (?, ?, ?)', ['fetch_delay_ms', '2000', '防风控每次请求睡眠毫秒数']);

    // 3. vtubers 表 (统一为主表)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bili_vtubers (
          uid BIGINT PRIMARY KEY COMMENT 'B站UID',
          uname VARCHAR(255) NOT NULL COMMENT '昵称',
          face VARCHAR(500) COMMENT '头像URL',
          sign TEXT COMMENT '个性签名',
          priority INT DEFAULT 0 COMMENT '调度优先级',
          next_check_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '下次抓取时间计算基准',
          is_active TINYINT(1) DEFAULT 1 COMMENT '0=停止监控 1=正在监控',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 自动热修复：弥补旧版本表结构可能缺失的新列
    await pool.query("ALTER TABLE bili_vtubers ADD COLUMN next_check_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP").catch(() => {});
    await pool.query("ALTER TABLE bili_vtubers ADD COLUMN priority INT DEFAULT 0").catch(() => {});

    // 4. videos 表 (纯元数据)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bili_videos (
          bvid VARCHAR(50) PRIMARY KEY COMMENT '视频BVID',
          uid BIGINT NOT NULL COMMENT 'UP主UID',
          title VARCHAR(500) NOT NULL COMMENT '视频标题',
          cover_pic VARCHAR(500) COMMENT '封面图URL',
          pubdate TIMESTAMP COMMENT '投稿时间',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_uid (uid),
          KEY idx_pubdate (pubdate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. creator_daily_stats (创作者快照表)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bili_creator_daily_stats (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          uid BIGINT NOT NULL,
          record_date DATE NOT NULL COMMENT '采集日期',
          follower_count INT DEFAULT 0 COMMENT '记录当日粉丝数',
          video_count INT DEFAULT 0 COMMENT '记录当日总稿件数',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_uid_date (uid, record_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. video_daily_stats (视频快照表)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bili_video_daily_stats (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          bvid VARCHAR(50) NOT NULL,
          record_date DATE NOT NULL COMMENT '采集日期',
          view_count BIGINT DEFAULT 0 COMMENT '播放量',
          reply_count BIGINT DEFAULT 0 COMMENT '评论数',
          coin_count BIGINT DEFAULT 0 COMMENT '硬币数',
          like_count BIGINT DEFAULT 0 COMMENT '点赞数',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_bvid_date (bvid, record_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    // 7. import_jobs (导入任务队列表)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bili_import_jobs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          job_type VARCHAR(50) DEFAULT 'followings_import',
          target_uid VARCHAR(50) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          progress_page INT DEFAULT 0,
          imported_count INT DEFAULT 0,
          error_message TEXT,
          cookie_override TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 自动热补丁：为排期、排序巨量数据建立关键性能索引，防止 Filesort (全表重排阻塞) 
    await pool.query("ALTER TABLE bili_video_daily_stats ADD INDEX idx_view_count (view_count DESC)").catch(() => {});
    await pool.query("ALTER TABLE bili_video_daily_stats ADD INDEX idx_record_date (record_date)").catch(() => {});
    await pool.query("ALTER TABLE bili_creator_daily_stats ADD INDEX idx_follower_count (follower_count DESC)").catch(() => {});

    console.log("[DB] MySQL 初始化完成！七大物理表就位。");
    return pool;
  } catch (error) {
    console.error("[DB] MySQL 初始化失败:", error);
    process.exit(1);
  }
}

export function getPool() {
  if (!pool) {
    throw new Error('MySQL pool is not initialized. Call initMySQL first.');
  }
  return pool;
}
