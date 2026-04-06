import cors from "cors";
import express from "express";
import { initMySQL, getPool } from "./mysql_db.js";
import { startWorker } from "./worker.js";
import { encryptCookie } from "./crypto.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3009;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_default_secret_should_not_be_used";

// 放宽 CORS，适应云端各种可能绑定的外网域名映射（使用 JWT 和 Plugin Secret 做根本拦截）
app.use(cors());
app.use(express.json());

// ================= 认证相关 =================
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "请提供用户名和密码" });

    const pool = getPool();
    const [rows] = await pool.query("SELECT * FROM bili_users WHERE username = ?", [username]);
    if (rows.length === 0) return res.status(401).json({ message: "账号或密码错误" });

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: "账号或密码错误" });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, username: user.username });
  } catch (error) {
    res.status(500).json({ message: "登录失败", error: String(error) });
  }
});

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "未授权或 Token 缺失" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Token 失效，请重新登录" });
  }
};

// ================= 配置管理 API =================
app.get("/api/config", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT * FROM bili_system_config");
    res.json({ success: true, configs: rows });
  } catch (e) {
    res.status(500).json({ message: "配置获取失败" });
  }
});

app.put("/api/config", requireAuth, async (req, res) => {
  try {
    const { configs } = req.body; 
    if (!Array.isArray(configs)) return res.status(400).json({ message: "参数错误" });
    
    const pool = getPool();
    for (let c of configs) {
       await pool.query("UPDATE bili_system_config SET config_value = ? WHERE config_key = ?", [c.config_value, c.config_key]);
    }
    res.json({ success: true, message: "配置保存成功" });
  } catch (e) {
    res.status(500).json({ message: "配置更新失败", error: String(e) });
  }
});

const PLUGIN_SECRET = "vup-web-local-plugin";

// ================= 插件推送锚点 API (无感录入) =================
// 插件推流目前作为本地数据源只负责写主表记录，将真正的 Daily Snapshots 交给统一调度任务负责
app.post("/api/plugin/vtubers", async (req, res) => {
  try {
    const pluginHeader = req.headers["x-plugin-secret"];
    const expectedSecret = process.env.PLUGIN_SECRET;
    
    // 如果系统没有设置密钥，为了不打破“拒绝未认证”前提，直接拦截并要求配好环境变量
    if (!expectedSecret || expectedSecret.trim() === '') {
        return res.status(500).json({ message: "Server Misconfig: 服务端未在 .env 中设置 PLUGIN_SECRET" });
    }
    
    // 双重校验：既要验证不可伪造的神谕密钥，又要校验浏览器扩展域以防外部跨站脚本
    if (pluginHeader !== expectedSecret) {
        return res.status(403).json({ message: "Forbidden: 无效的 Plugin Secret，拒绝录入机器请求。" });
    }
    
    const origin = req.headers.origin || "";
    if (origin && !origin.startsWith("chrome-extension://")) {
        return res.status(403).json({ message: "Forbidden: 非法调起源。" });
    }

    const { uid, uname, face, sign } = req.body;
    if (!uid || !uname) {
      return res.status(400).json({ message: "UID 和 uname 是必填项" });
    }

    const pool = getPool();
    // 插件只写主表，不再负责打 daily_stats 快照
    await pool.query(`
      INSERT INTO bili_vtubers (uid, uname, face, sign)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        uname = VALUES(uname), face = VALUES(face), sign = VALUES(sign);
    `, [uid, uname, face || '', sign || '']);
    
    console.log(`[Plugin] 发现主播并更新字典: ${uname} (UID: ${uid})`);
    res.json({ success: true, message: `UP主 ${uname} 基础信息入库成功!` });
  } catch (error) {
    console.error("[Plugin] 入库异常:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ================= 关注列表导入任务管理 =================
app.post("/api/jobs/import-followings", requireAuth, async (req, res) => {
  try {
    const { targetUid, customCookie } = req.body;
    if (!targetUid) {
      return res.status(400).json({ message: "请提供目标 UID" });
    }

    const pool = getPool();
    const [result] = await pool.query(`
      INSERT INTO bili_import_jobs (job_type, target_uid, status, cookie_override)
      VALUES ('followings_import', ?, 'pending', ?)
    `, [targetUid, customCookie || '']);

    res.json({ success: true, jobId: result.insertId });
  } catch (error) {
    console.error("[Job] 创建导入任务失败:", error);
    res.status(500).json({ success: false, message: "创建导入任务失败" });
  }
});

app.get("/api/jobs/:id", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT * FROM bili_import_jobs WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "任务不存在" });
    }
    res.json({ success: true, job: rows[0] });
  } catch (error) {
    res.status(500).json({ message: "查询任务状态失败" });
  }
});

// ================= B 站扫码自动登录提取 Cookie =================
const qrSessions = new Map(); // Store qrcode_key -> expirationTime

app.get("/api/bilibili/qrcode/generate", requireAuth, async (req, res) => {
  try {
    const response = await fetch("https://passport.bilibili.com/x/passport-login/web/qrcode/generate", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const payload = await response.json();
    if (payload.code === 0) {
      const { url, qrcode_key } = payload.data;
      qrSessions.set(qrcode_key, Date.now() + 180 * 1000); // 3分钟过期
      return res.json({ success: true, url, qrcode_key });
    }
    return res.status(500).json({ success: false, message: "无法向B站请求二维码" });
  } catch (error) {
    console.error("QR Generate error:", error);
    res.status(500).json({ success: false, message: "生成二维码失败" });
  }
});

app.get("/api/bilibili/qrcode/poll", requireAuth, async (req, res) => {
  try {
    const { qrcode_key } = req.query;
    if (!qrcode_key || !qrSessions.has(qrcode_key)) {
      return res.status(400).json({ success: false, code: 86038, message: "二维码不存在或已过期,请刷新重试" });
    }
    if (Date.now() > qrSessions.get(qrcode_key)) {
      qrSessions.delete(qrcode_key);
      return res.status(400).json({ success: false, code: 86038, message: "二维码已过期" });
    }

    const response = await fetch(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const payload = await response.json();
    
    // B站扫码成功状态码是 0
    if (payload.code === 0 && payload.data.code === 0) {
      // 成功确认登录！获取 headers 内的 Set-Cookie
      const setCookieHeaders = response.headers.get("set-cookie");
      if (setCookieHeaders) {
          // 清洗并提取 SESSDATA, bili_jct 等
          const cookies = setCookieHeaders.split(',').map(c => c.split(';')[0].trim());
          const finalCookie = cookies.join('; ');
          
          let loggedInUid = '';
          cookies.forEach(c => {
             if (c.startsWith('DedeUserID=')) {
                 loggedInUid = c.split('=')[1];
             }
          });
          
          // 对抓到的明文做 AES 加密落库
          const encryptedCookieStr = encryptCookie(finalCookie);
          
          if (req.query.transient !== 'true') {
            const pool = getPool();
            await pool.query(`
              INSERT INTO bili_system_config (config_key, config_value, description)
              VALUES ('bili_cookie_encrypted', ?, '系统自动扫码捕获的动态密文凭证')
              ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
            `, [encryptedCookieStr]);
          }
          
          qrSessions.delete(qrcode_key);
          return res.json({ 
              success: true, 
              message: "扫码抓取圆满成功，鉴权密钥已加密就绪！", 
              code: 0, 
              encrypted_cookie: encryptedCookieStr,
              logged_in_uid: loggedInUid
          });
      }
    }
    
    return res.json({ success: true, code: payload.data.code, message: payload.data.message });
  } catch (error) {
    res.status(500).json({ success: false, message: "轮询异常" });
  }
});

// ================= 月度百大视频榜 API =================
app.get("/api/growth/monthly", requireAuth, async (req, res) => {
  try {
    const { month } = req.query; // format: 'YYYY-MM'
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "参数不合法，期望格式为 YYYY-MM" });
    }
    
    let limit = parseInt(req.query.limit) || 100;
    if (limit <= 0) limit = 100;
    if (limit > 5000) limit = 5000;
    
    const pool = getPool();
    const query = `
      SELECT 
        v.bvid, v.title, v.cover_pic, v.pubdate,
        u.uid, u.uname, u.face,
        COALESCE(s.view_count, 0) as today_views,
        COALESCE(s.reply_count, 0) as reply_count
      FROM bili_videos v
      JOIN bili_vtubers u ON v.uid = u.uid AND u.is_active = 1
      LEFT JOIN bili_video_daily_stats s ON v.bvid = s.bvid AND s.record_date = (
         SELECT MAX(record_date) FROM bili_video_daily_stats WHERE bvid = v.bvid
      )
      WHERE DATE_FORMAT(v.pubdate, '%Y-%m') = ?
      ORDER BY COALESCE(s.view_count, 0) DESC
      LIMIT ?
    `;
    const [rows] = await pool.query(query, [month, limit]);
    res.json({ success: true, items: rows });
  } catch (error) {
    console.error("Fetch monthly top 100 failed:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ================= 主名单查询查询 API =================
app.get("/api/vtubers", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const search = String(req.query.search || "").trim();
    const type = String(req.query.type || "uname").trim();
    const offset = (page - 1) * pageSize;
    const statusMode = String(req.query.status) === 'banned' ? 0 : 1;

    let conditions = ["v.is_active = ?"];
    let params = [statusMode];

    let havingConditions = [];

    if (search) {
      if (type === "uid") {
         conditions.push("v.uid LIKE ?");
         params.push(`%${search}%`);
      } else {
         conditions.push("v.uname LIKE ?");
         params.push(`%${search}%`);
      }
    }

    const minVideos = parseInt(req.query.minVideos);
    const maxVideos = parseInt(req.query.maxVideos);
    if (!isNaN(minVideos)) {
      havingConditions.push("video_count >= ?");
      params.push(minVideos);
    }
    if (!isNaN(maxVideos)) {
      havingConditions.push("video_count <= ?");
      params.push(maxVideos);
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const havingClause = havingConditions.length > 0 ? "HAVING " + havingConditions.join(" AND ") : "";

    const pool = getPool();
    
    // 子查询获取带快照的数据列
    const baseQuery = `
      SELECT 
        v.uid, v.uname, v.face, v.sign, v.priority, v.is_active, v.created_at,
        (SELECT follower_count FROM bili_creator_daily_stats WHERE uid = v.uid ORDER BY record_date DESC LIMIT 1) as follower_count,
        (SELECT COUNT(*) FROM bili_videos WHERE uid = v.uid) as video_count
      FROM bili_vtubers v
      ${whereClause}
      ${havingClause}
    `;

    // 统计满足过滤条件的总数（由于使用了 HAVING 别名，我们需要用外层包装器算 count）
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM (${baseQuery}) as t`, params);
    const total = countRows[0] ? countRows[0].total : 0;

    const [vtubers] = await pool.query(`
      ${baseQuery}
      ORDER BY v.priority DESC, v.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);

    res.json({ total, page, pageSize, search, items: vtubers });
  } catch (error) {
    console.error("[DB] 大名单查询失败:", error);
    res.status(500).json({ message: "数据库查询失败", error: String(error) });
  }
});

// ================= 主播权重设定 API =================
app.put("/api/vtubers/:uid/priority", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const newPriority = parseInt(req.body.priority) || 0;
    await pool.query("UPDATE bili_vtubers SET priority = ? WHERE uid = ?", [newPriority, req.params.uid]);
    res.json({ success: true, priority: newPriority });
  } catch (error) {
    console.error("[DB] 权重修改失败:", error);
    res.status(500).json({ message: "权重修改失败", error: String(error) });
  }
});

// ================= 封禁状态切换 API =================
app.put("/api/vtubers/:uid/toggle-status", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const newStatus = parseInt(req.body.status) === 0 ? 0 : 1;
    await pool.query("UPDATE bili_vtubers SET is_active = ? WHERE uid = ?", [newStatus, req.params.uid]);
    res.json({ success: true, is_active: newStatus });
  } catch (error) {
    console.error("[DB] 封禁状态修改失败:", error);
    res.status(500).json({ message: "操作失败", error: String(error) });
  }
});

// ================= 删除主播 API =================
app.delete("/api/vtubers/:uid", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    await pool.query("DELETE FROM bili_vtubers WHERE uid = ?", [req.params.uid]);
    res.json({ success: true });
  } catch (error) {
    console.error("[DB] 删除主播失败:", error);
    res.status(500).json({ message: "删除失败", error: String(error) });
  }
});

// ================= 飙升量排行榜 API =================

// 1. 创作者涨粉榜
app.get("/api/growth/fans", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT 
          v.uid, v.uname, v.face, v.priority, v.is_active,
          t1.follower_count as today_fans,
          t2.follower_count as yesterday_fans,
          (t1.follower_count - COALESCE(t2.follower_count, t1.follower_count)) as fans_growth
      FROM bili_vtubers v
      JOIN bili_creator_daily_stats t1 ON v.uid = t1.uid AND t1.record_date = CURDATE()
      LEFT JOIN bili_creator_daily_stats t2 ON v.uid = t2.uid AND t2.record_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      WHERE v.is_active = 1
      ORDER BY fans_growth DESC, priority DESC
      LIMIT 100
    `);
    
    res.json({ success: true, count: rows.length, items: rows });
  } catch (error) {
    res.status(500).json({ message: "粉丝榜单计算失败", error: String(error) });
  }
});

// 2. 爆款视频涨播放榜
app.get("/api/growth/videos", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT 
          v.bvid, v.title, v.cover_pic, v.uid,
          u.uname, u.face,
          t1.view_count as today_views,
          (t1.view_count - COALESCE(t2.view_count, t1.view_count)) as view_growth,
          (t1.reply_count - COALESCE(t2.reply_count, t1.reply_count)) as reply_growth
      FROM bili_videos v
      JOIN bili_vtubers u ON v.uid = u.uid AND u.is_active = 1
      JOIN bili_video_daily_stats t1 ON v.bvid = t1.bvid AND t1.record_date = CURDATE()
      LEFT JOIN bili_video_daily_stats t2 ON v.bvid = t2.bvid AND t2.record_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      HAVING view_growth > 0
      ORDER BY view_growth DESC
      LIMIT 100
    `);
    
    res.json({ success: true, count: rows.length, items: rows });
  } catch (error) {
    res.status(500).json({ message: "视频榜单计算失败", error: String(error) });
  }
});

// ================= 全域视频库 API =================
app.get("/api/videos", requireAuth, async (req, res) => {
  try {
    const { sort = 'view_count', sortOrder = 'DESC', page = 1, limit = 50, keyword, minViews, maxViews } = req.query;
    const validSorts = ['view_count', 'reply_count', 'pubdate'];
    const orderBy = validSorts.includes(sort) ? sort : 'view_count';
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const pool = getPool();

    let conditions = [];
    let params = [];
    if (keyword) {
      conditions.push("u.uname LIKE ?");
      params.push(`%${keyword}%`);
    }

    let havingConditions = [];
    const minV = parseInt(minViews);
    const maxV = parseInt(maxViews);
    if (!isNaN(minV)) {
      havingConditions.push("view_count_val >= ?");
      params.push(minV);
    }
    if (!isNaN(maxV)) {
      havingConditions.push("view_count_val <= ?");
      params.push(maxV);
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const havingClause = havingConditions.length > 0 ? "HAVING " + havingConditions.join(" AND ") : "";

    const baseQuery = `
      SELECT 
        v.bvid, v.title, v.cover_pic, v.pubdate,
        u.uid, u.uname, u.face,
        s.view_count, s.reply_count,
        COALESCE(s.view_count, 0) as view_count_val
      FROM bili_videos v
      JOIN bili_vtubers u ON v.uid = u.uid AND u.is_active = 1
      LEFT JOIN bili_video_daily_stats s ON v.bvid = s.bvid AND s.record_date = (
         SELECT MAX(record_date) FROM bili_video_daily_stats WHERE bvid = v.bvid
      )
      ${whereClause}
      ${havingClause}
    `;

    // 采用 COALESCE 兜底，防止没有今日快照的视频丢失排序逻辑，确保全量呈现
    // 特殊处理 pubdate，因为它在 v 表而不是 s 表中
    const orderByClause = orderBy === 'pubdate' ? `v.pubdate ${orderDirection}` : `COALESCE(s.${orderBy}, 0) ${orderDirection}`;
    const [rows] = await pool.query(`
      ${baseQuery}
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM (${baseQuery}) as t`, params);
    const totalRowsCount = countRows[0] ? countRows[0].total : 0;
    
    res.json({ success: true, data: rows, total: totalRowsCount });
  } catch(error) {
    console.error(error);
    res.status(500).json({ success: false, message: "获取视频库失败" });
  }
});

// ================= 服务启停挂载 =================
initMySQL().then(() => {
  app.listen(port, () => {
    console.log(`[Server] 主网已启动 / Auth模式 - listening on http://localhost:${port}`);
    startWorker(); // 启动全自动抓取无人值守进程
  });
}).catch(err => {
  console.error("服务器启动失败:", err);
});
