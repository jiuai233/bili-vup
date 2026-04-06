import { initMySQL, getPool } from "../src/mysql_db.js";

async function runMigration() {
  console.log("🚀 开始执行原系统 4000 用户迁移脚本...");
  try {
    const pool = await initMySQL();
    
    // 1. 尝试将 followings 的主播转移进入 bili_vtubers
    console.log("步骤 1：同步基础档案至 bili_vtubers 主表...");
    const [migrated] = await pool.query(`
        INSERT IGNORE INTO bili_vtubers (uid, uname, sign, face)
        SELECT uid, uname, sign, face FROM followings
    `);
    console.log(`✅ 从 followings 成功同步 ${migrated.affectedRows} 条不重复记录！`);

    // 2. 补全这批用户的首日空白快照
    console.log("步骤 2：对缺失初始记录的主播生成一次0起点首日快照...");
    const today = new Date().toISOString().split('T')[0];
    
    // 把当前 vtubers 中还没有出现在 creator_daily_stats 表中的主播，插入一条空记录 (便于前端呈现数据与后续增量比对)
    const [snapshot] = await pool.query(`
        INSERT IGNORE INTO bili_creator_daily_stats (uid, record_date, follower_count, video_count)
        SELECT uid, ?, 0, 0 
        FROM bili_vtubers 
        WHERE uid NOT IN (SELECT uid FROM bili_creator_daily_stats WHERE record_date = ?)
    `, [today, today]);
    
    console.log(`✅ 已成功补平 ${snapshot.affectedRows} 人的首日零数快照集！前端列表恢复完整。`);

    console.log("🏁 迁移任务 100% 达成。您随时可以舍弃 followings 旧表！");
    process.exit(0);
  } catch (err) {
    console.error("❌ 迁移过程中发生致命错误:", err);
    process.exit(1);
  }
}

runMigration();
