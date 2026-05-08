import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { initMySQL, getPool } from "./mysql_db.js";
import { startWorker } from "./worker.js";
import { encryptCookie } from "./crypto.js";
import { getShanghaiDayUnixRange, getShanghaiMonthUnixRange, getShanghaiTodayAndYesterday } from "./time.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3009;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_default_secret_should_not_be_used";

app.use(cors());
app.use(express.json());

function extractCookiePairsFromHeaders(headers) {
  if (typeof headers.getSetCookie !== "function") {
    throw new Error("当前运行时不支持安全读取 Set-Cookie 响应头");
  }

  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter(Boolean);
}

function normalizeTagText(tagText) {
  return String(tagText || "").trim().replace(/\s+/g, " ");
}

function looksLikeEncryptedCookie(value) {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(String(value || "").trim());
}

function isPrivateIpv4(ip) {
  return /^10\./.test(ip)
    || /^192\.168\./.test(ip)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function isInternalRequest(req) {
  const remoteAddress = String(req.ip || req.socket?.remoteAddress || "").trim();
  const normalized = remoteAddress.replace(/^::ffff:/, "");

  return normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "::ffff:127.0.0.1"
    || isPrivateIpv4(normalized);
}

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "未授权或 Token 缺失" });
  }

  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Token 已失效，请重新登录" });
  }
};

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "请提供用户名和密码" });
    }

    const pool = getPool();
    const [rows] = await pool.query("SELECT * FROM bili_users WHERE username = ?", [username]);
    if (rows.length === 0) {
      return res.status(401).json({ message: "账号或密码错误" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "账号或密码错误" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, username: user.username });
  } catch (error) {
    res.status(500).json({ message: "登录失败", error: String(error) });
  }
});

app.post("/api/internal/register", async (req, res) => {
  try {
    if (!isInternalRequest(req)) {
      return res.status(403).json({ message: "Forbidden: 仅允许内网或本机调用" });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "请提供用户名和密码" });
    }

    const normalizedUsername = String(username).trim();
    if (!normalizedUsername) {
      return res.status(400).json({ message: "用户名不能为空" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "密码长度不能少于 6 位" });
    }

    const pool = getPool();
    const [existingRows] = await pool.query("SELECT id FROM bili_users WHERE username = ?", [normalizedUsername]);
    if (existingRows.length > 0) {
      return res.status(409).json({ message: "用户名已存在" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);
    const [result] = await pool.query(
      "INSERT INTO bili_users (username, password_hash) VALUES (?, ?)",
      [normalizedUsername, passwordHash]
    );

    res.json({ success: true, id: result.insertId, username: normalizedUsername });
  } catch (error) {
    res.status(500).json({ message: "注册失败", error: String(error) });
  }
});

app.get("/api/config", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT * FROM bili_system_config");
    res.json({ success: true, configs: rows });
  } catch {
    res.status(500).json({ message: "配置获取失败" });
  }
});

app.put("/api/config", requireAuth, async (req, res) => {
  try {
    const { configs } = req.body;
    if (!Array.isArray(configs)) {
      return res.status(400).json({ message: "参数错误" });
    }

    const pool = getPool();
    for (const config of configs) {
      await pool.query(
        "UPDATE bili_system_config SET config_value = ? WHERE config_key = ?",
        [config.config_value, config.config_key]
      );
    }

    res.json({ success: true, message: "配置保存成功" });
  } catch (error) {
    res.status(500).json({ message: "配置更新失败", error: String(error) });
  }
});

app.post("/api/plugin/vtubers", async (req, res) => {
  try {
    const pluginHeader = req.headers["x-plugin-secret"];
    const expectedSecret = process.env.PLUGIN_SECRET;

    if (!expectedSecret || !expectedSecret.trim()) {
      return res.status(500).json({ message: "Server Misconfig: 服务端未在 .env 中设置 PLUGIN_SECRET" });
    }

    if (pluginHeader !== expectedSecret) {
      return res.status(403).json({ message: "Forbidden: 无效的 Plugin Secret" });
    }

    const origin = req.headers.origin || "";
    if (origin && !origin.startsWith("chrome-extension://")) {
      return res.status(403).json({ message: "Forbidden: 非法调起来源" });
    }

    const { uid, uname, face, sign } = req.body;
    if (!uid || !uname) {
      return res.status(400).json({ message: "UID 和 uname 是必填项" });
    }

    const pool = getPool();
    await pool.query(
      `
        INSERT INTO bili_vtubers (uid, uname, face, sign)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          uname = VALUES(uname),
          face = VALUES(face),
          sign = VALUES(sign)
      `,
      [uid, uname, face || "", sign || ""]
    );

    console.log(`[Plugin] 发现主播并更新信息: ${uname} (UID: ${uid})`);
    res.json({ success: true, message: `UP 主 ${uname} 基础信息入库成功` });
  } catch (error) {
    console.error("[Plugin] 入库异常:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/jobs/import-followings", requireAuth, async (req, res) => {
  try {
    const { targetUid, customCookie } = req.body;
    if (!targetUid) {
      return res.status(400).json({ message: "请提供目标 UID" });
    }

    const normalizedCookieOverride = String(customCookie || "").trim();
    const encryptedCookieOverride = normalizedCookieOverride
      ? (looksLikeEncryptedCookie(normalizedCookieOverride)
          ? normalizedCookieOverride
          : encryptCookie(normalizedCookieOverride))
      : "";

    const pool = getPool();
    const [result] = await pool.query(
      `
        INSERT INTO bili_import_jobs (job_type, target_uid, status, cookie_override)
        VALUES ('followings_import', ?, 'pending', ?)
      `,
      [targetUid, encryptedCookieOverride]
    );

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
  } catch {
    res.status(500).json({ message: "查询任务状态失败" });
  }
});

const qrSessions = new Map();

app.get("/api/bilibili/qrcode/generate", requireAuth, async (req, res) => {
  try {
    const response = await fetch("https://passport.bilibili.com/x/passport-login/web/qrcode/generate", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const payload = await response.json();

    if (payload.code === 0) {
      const { url, qrcode_key } = payload.data;
      qrSessions.set(qrcode_key, Date.now() + 180 * 1000);
      return res.json({ success: true, url, qrcode_key });
    }

    return res.status(500).json({ success: false, message: "无法向 B 站请求二维码" });
  } catch (error) {
    console.error("QR Generate error:", error);
    res.status(500).json({ success: false, message: "生成二维码失败" });
  }
});

app.get("/api/bilibili/qrcode/poll", requireAuth, async (req, res) => {
  try {
    const { qrcode_key } = req.query;
    if (!qrcode_key || !qrSessions.has(qrcode_key)) {
      return res.status(400).json({ success: false, code: 86038, message: "二维码不存在或已过期，请刷新重试" });
    }
    if (Date.now() > qrSessions.get(qrcode_key)) {
      qrSessions.delete(qrcode_key);
      return res.status(400).json({ success: false, code: 86038, message: "二维码已过期" });
    }

    const response = await fetch(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const payload = await response.json();

    if (payload.code === 0 && payload.data.code === 0) {
      const cookies = extractCookiePairsFromHeaders(response.headers);
      if (cookies.length === 0) {
        throw new Error("扫码成功，但响应头中未读取到有效 Cookie");
      }

      const finalCookie = cookies.join("; ");
      let loggedInUid = "";
      cookies.forEach((cookie) => {
        if (cookie.startsWith("DedeUserID=")) {
          loggedInUid = cookie.split("=")[1];
        }
      });

      const encryptedCookieStr = encryptCookie(finalCookie);

      if (req.query.transient !== "true") {
        const pool = getPool();
        await pool.query(
          `
            INSERT INTO bili_system_config (config_key, config_value, description)
            VALUES ('bili_cookie_encrypted', ?, '系统自动扫码获取的加密 Cookie')
            ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
          `,
          [encryptedCookieStr]
        );
      }

      qrSessions.delete(qrcode_key);
      return res.json({
        success: true,
        message: "扫码获取凭证成功，已完成加密保存",
        code: 0,
        encrypted_cookie: encryptedCookieStr,
        logged_in_uid: loggedInUid
      });
    }

    return res.json({ success: true, code: payload.data.code, message: payload.data.message });
  } catch (error) {
    console.error("QR Poll error:", error);
    res.status(500).json({ success: false, message: "轮询异常" });
  }
});

app.get("/api/growth/monthly", requireAuth, async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: "参数不合法，期望格式为 YYYY-MM" });
    }

    let limit = parseInt(req.query.limit) || 100;
    if (limit <= 0) limit = 100;
    if (limit > 5000) limit = 5000;

    const { startUnix, endUnix } = getShanghaiMonthUnixRange(month);
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT
          v.bvid, v.title, v.cover_pic, v.pubdate,
          u.uid, u.uname, u.face,
          COALESCE(s.view_count, 0) AS today_views,
          COALESCE(s.reply_count, 0) AS reply_count
        FROM bili_videos v
        JOIN bili_vtubers u ON v.uid = u.uid AND u.is_active = 1
        LEFT JOIN bili_video_daily_stats s ON v.bvid = s.bvid AND s.record_date = (
          SELECT MAX(record_date) FROM bili_video_daily_stats WHERE bvid = v.bvid
        )
        WHERE UNIX_TIMESTAMP(v.pubdate) >= ?
          AND UNIX_TIMESTAMP(v.pubdate) < ?
        ORDER BY COALESCE(s.view_count, 0) DESC
        LIMIT ?
      `,
      [startUnix, endUnix, limit]
    );

    res.json({ success: true, items: rows });
  } catch (error) {
    console.error("Fetch monthly top failed:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/vtubers/:uid/tags", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `
        SELECT
          t.id,
          t.uid,
          t.user_id,
          t.tag_text,
          t.created_at,
          t.updated_at,
          u.username
        FROM bili_vtuber_user_tags t
        JOIN bili_users u ON t.user_id = u.id
        WHERE t.uid = ?
        ORDER BY t.created_at ASC, t.id ASC
      `,
      [req.params.uid]
    );

    res.json({ success: true, items: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "获取主播标签失败", error: String(error) });
  }
});

app.post("/api/vtubers/:uid/tags", requireAuth, async (req, res) => {
  try {
    const tagText = normalizeTagText(req.body.tagText);
    if (!tagText) {
      return res.status(400).json({ message: "标签不能为空" });
    }
    if (tagText.length > 100) {
      return res.status(400).json({ message: "标签长度不能超过 100" });
    }

    const pool = getPool();
    await pool.query(
      `
        INSERT INTO bili_vtuber_user_tags (uid, user_id, tag_text)
        VALUES (?, ?, ?)
      `,
      [req.params.uid, req.user.id, tagText]
    );

    res.json({ success: true });
  } catch (error) {
    if (String(error).includes("Duplicate entry")) {
      return res.status(409).json({ message: "该标签已存在" });
    }
    res.status(500).json({ success: false, message: "新增主播标签失败", error: String(error) });
  }
});

app.put("/api/vtuber-tags/:id", requireAuth, async (req, res) => {
  try {
    const tagText = normalizeTagText(req.body.tagText);
    if (!tagText) {
      return res.status(400).json({ message: "标签不能为空" });
    }
    if (tagText.length > 100) {
      return res.status(400).json({ message: "标签长度不能超过 100" });
    }

    const pool = getPool();
    const [rows] = await pool.query("SELECT id, user_id FROM bili_vtuber_user_tags WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "标签不存在" });
    }
    if (Number(rows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "只能编辑自己的标签" });
    }

    await pool.query("UPDATE bili_vtuber_user_tags SET tag_text = ? WHERE id = ?", [tagText, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    if (String(error).includes("Duplicate entry")) {
      return res.status(409).json({ message: "该标签已存在" });
    }
    res.status(500).json({ success: false, message: "编辑主播标签失败", error: String(error) });
  }
});

app.delete("/api/vtuber-tags/:id", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT id, user_id FROM bili_vtuber_user_tags WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "标签不存在" });
    }
    if (Number(rows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "只能删除自己的标签" });
    }

    await pool.query("DELETE FROM bili_vtuber_user_tags WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "删除主播标签失败", error: String(error) });
  }
});

app.get("/api/vtubers", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const search = String(req.query.search || "").trim();
    const type = String(req.query.type || "uname").trim();
    const tagFilter = normalizeTagText(req.query.tag);
    const favoritesOnly = String(req.query.favorites || "").trim() === "1";
    const updatedFrom = String(req.query.updatedFrom || "").trim();
    const updatedTo = String(req.query.updatedTo || "").trim();
    const sortField = String(req.query.sortField || "updated_at").trim();
    const sortOrder = String(req.query.sortOrder || "DESC").trim().toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (page - 1) * pageSize;
    const statusMode = String(req.query.status) === "banned" ? 0 : 1;

    const conditions = ["v.is_active = ?"];
    const params = [statusMode];
    const havingConditions = [];

    if (search) {
      if (type === "uid") {
        conditions.push("v.uid LIKE ?");
      } else {
        conditions.push("v.uname LIKE ?");
      }
      params.push(`%${search}%`);
    }

    if (tagFilter) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM bili_vtuber_user_tags vt
          WHERE vt.uid = v.uid
            AND LOWER(vt.tag_text) = LOWER(?)
        )
      `);
      params.push(tagFilter);
    }

    if (favoritesOnly) {
      conditions.push("v.is_favorite = 1");
    }

    if (updatedFrom) {
      const { startUnix } = getShanghaiDayUnixRange(updatedFrom);
      conditions.push("UNIX_TIMESTAMP(v.last_checked_at) >= ?");
      params.push(startUnix);
    }

    if (updatedTo) {
      const { endUnix } = getShanghaiDayUnixRange(updatedTo);
      conditions.push("UNIX_TIMESTAMP(v.last_checked_at) < ?");
      params.push(endUnix);
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(" AND ")}` : "";
    const allowedSortFields = new Set(["last_checked_at", "updated_at", "created_at", "follower_count", "video_count", "priority", "next_check_at", "is_favorite"]);
    const orderField = allowedSortFields.has(sortField) ? sortField : "last_checked_at";
    const orderByClause = `ORDER BY ${orderField} ${sortOrder}, v.priority DESC, v.created_at DESC`;

    const pool = getPool();
    const baseQuery = `
      SELECT
        v.uid, v.uname, v.face, v.sign, v.priority, v.is_active, v.created_at, v.updated_at, v.next_check_at, v.last_checked_at, v.is_favorite,
        (SELECT follower_count FROM bili_creator_daily_stats WHERE uid = v.uid ORDER BY record_date DESC LIMIT 1) AS follower_count,
        (SELECT COUNT(*) FROM bili_videos WHERE uid = v.uid) AS video_count
      FROM bili_vtubers v
      ${whereClause}
      ${havingClause}
    `;

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM (${baseQuery}) AS t`, params);
    const total = countRows[0] ? countRows[0].total : 0;

    const [vtubers] = await pool.query(
      `
        ${baseQuery}
        ${orderByClause}
        LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );

    const uids = vtubers.map((row) => row.uid);
    let tagRows = [];
    if (uids.length > 0) {
      const placeholders = uids.map(() => "?").join(", ");
      const [allTags] = await pool.query(
        `
          SELECT
            t.id,
            t.uid,
            t.user_id,
            t.tag_text,
            t.created_at,
            t.updated_at,
            u.username
          FROM bili_vtuber_user_tags t
          JOIN bili_users u ON t.user_id = u.id
          WHERE t.uid IN (${placeholders})
          ORDER BY t.created_at ASC, t.id ASC
        `,
        uids
      );
      tagRows = allTags;
    }

    const tagsByUid = new Map();
    tagRows.forEach((tag) => {
      if (!tagsByUid.has(tag.uid)) {
        tagsByUid.set(tag.uid, []);
      }
      tagsByUid.get(tag.uid).push(tag);
    });

    const items = vtubers.map((row) => ({
      ...row,
      tags: tagsByUid.get(row.uid) || [],
    }));

    res.json({ total, page, pageSize, search, items });
  } catch (error) {
    console.error("[DB] 大名单查询失败:", error);
    res.status(500).json({ message: "数据库查询失败", error: String(error) });
  }
});

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

app.put("/api/vtubers/:uid/favorite", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const isFavorite = parseInt(req.body.is_favorite) === 1 ? 1 : 0;
    await pool.query("UPDATE bili_vtubers SET is_favorite = ? WHERE uid = ?", [isFavorite, req.params.uid]);
    res.json({ success: true, is_favorite: isFavorite });
  } catch (error) {
    console.error("[DB] 收藏状态修改失败:", error);
    res.status(500).json({ message: "收藏状态修改失败", error: String(error) });
  }
});

app.put("/api/vtubers/:uid/toggle-status", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const newStatus = parseInt(req.body.status) === 0 ? 0 : 1;
    await pool.query("UPDATE bili_vtubers SET is_active = ? WHERE uid = ?", [newStatus, req.params.uid]);
    res.json({ success: true, is_active: newStatus });
  } catch (error) {
    console.error("[DB] 状态修改失败:", error);
    res.status(500).json({ message: "操作失败", error: String(error) });
  }
});

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

app.get("/api/growth/fans", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { today, yesterday } = getShanghaiTodayAndYesterday();
    const [rows] = await pool.query(
      `
        SELECT
          v.uid, v.uname, v.face, v.priority, v.is_active,
          t1.follower_count AS today_fans,
          t2.follower_count AS yesterday_fans,
          (t1.follower_count - COALESCE(t2.follower_count, t1.follower_count)) AS fans_growth
        FROM bili_vtubers v
        JOIN bili_creator_daily_stats t1 ON v.uid = t1.uid AND t1.record_date = ?
        LEFT JOIN bili_creator_daily_stats t2 ON v.uid = t2.uid AND t2.record_date = ?
        WHERE v.is_active = 1
        ORDER BY fans_growth DESC, priority DESC
        LIMIT 100
      `,
      [today, yesterday]
    );

    const uids = [...new Set(rows.map((row) => row.uid))];
    let tagRows = [];
    if (uids.length > 0) {
      const placeholders = uids.map(() => "?").join(", ");
      const [allTags] = await pool.query(
        `
          SELECT
            t.id,
            t.uid,
            t.user_id,
            t.tag_text,
            t.created_at,
            t.updated_at,
            u.username
          FROM bili_vtuber_user_tags t
          JOIN bili_users u ON t.user_id = u.id
          WHERE t.uid IN (${placeholders})
          ORDER BY t.created_at ASC, t.id ASC
        `,
        uids
      );
      tagRows = allTags;
    }

    const tagsByUid = new Map();
    tagRows.forEach((tag) => {
      if (!tagsByUid.has(tag.uid)) {
        tagsByUid.set(tag.uid, []);
      }
      tagsByUid.get(tag.uid).push(tag);
    });

    const items = rows.map((row) => ({
      ...row,
      vtuber_tags: tagsByUid.get(row.uid) || [],
    }));

    res.json({ success: true, count: items.length, items });
  } catch (error) {
    res.status(500).json({ message: "粉丝榜单计算失败", error: String(error) });
  }
});

app.get("/api/growth/videos", requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { today, yesterday } = getShanghaiTodayAndYesterday();
    const [rows] = await pool.query(
      `
        SELECT
          v.bvid, v.title, v.cover_pic, v.uid,
          u.uname, u.face,
          t1.view_count AS today_views,
          (t1.view_count - COALESCE(t2.view_count, t1.view_count)) AS view_growth,
          (t1.reply_count - COALESCE(t2.reply_count, t1.reply_count)) AS reply_growth
        FROM bili_videos v
        JOIN bili_vtubers u ON v.uid = u.uid AND u.is_active = 1
        JOIN bili_video_daily_stats t1 ON v.bvid = t1.bvid AND t1.record_date = ?
        LEFT JOIN bili_video_daily_stats t2 ON v.bvid = t2.bvid AND t2.record_date = ?
        HAVING view_growth > 0
        ORDER BY view_growth DESC
        LIMIT 100
      `,
      [today, yesterday]
    );

    const uids = [...new Set(rows.map((row) => row.uid))];
    let tagRows = [];
    if (uids.length > 0) {
      const placeholders = uids.map(() => "?").join(", ");
      const [allTags] = await pool.query(
        `
          SELECT
            t.id,
            t.uid,
            t.user_id,
            t.tag_text,
            t.created_at,
            t.updated_at,
            u.username
          FROM bili_vtuber_user_tags t
          JOIN bili_users u ON t.user_id = u.id
          WHERE t.uid IN (${placeholders})
          ORDER BY t.created_at ASC, t.id ASC
        `,
        uids
      );
      tagRows = allTags;
    }

    const tagsByUid = new Map();
    tagRows.forEach((tag) => {
      if (!tagsByUid.has(tag.uid)) {
        tagsByUid.set(tag.uid, []);
      }
      tagsByUid.get(tag.uid).push(tag);
    });

    const items = rows.map((row) => ({
      ...row,
      vtuber_tags: tagsByUid.get(row.uid) || [],
    }));

    res.json({ success: true, count: items.length, items });
  } catch (error) {
    res.status(500).json({ message: "视频榜单计算失败", error: String(error) });
  }
});

app.get("/api/videos", requireAuth, async (req, res) => {
  try {
    const { sort = "view_count", sortOrder = "DESC", page = 1, limit = 50, keyword, minViews, maxViews } = req.query;
    const vtuberTagFilter = normalizeTagText(req.query.vtuberTag);
    const validSorts = ["view_count", "reply_count", "pubdate"];
    const orderBy = validSorts.includes(sort) ? sort : "view_count";
    const orderDirection = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const pool = getPool();

    const conditions = [];
    const params = [];
    if (keyword) {
      conditions.push("u.uname LIKE ?");
      params.push(`%${keyword}%`);
    }

    if (vtuberTagFilter) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM bili_vtuber_user_tags vt
          WHERE vt.uid = v.uid
            AND LOWER(vt.tag_text) = LOWER(?)
        )
      `);
      params.push(vtuberTagFilter);
    }

    const havingConditions = [];
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(" AND ")}` : "";

    const baseQuery = `
      SELECT
        v.bvid, v.title, v.cover_pic, v.pubdate,
        u.uid, u.uname, u.face,
        s.view_count, s.reply_count,
        COALESCE(s.view_count, 0) AS view_count_val
      FROM bili_videos v
      JOIN bili_vtubers u ON v.uid = u.uid AND u.is_active = 1
      LEFT JOIN bili_video_daily_stats s ON v.bvid = s.bvid AND s.record_date = (
        SELECT MAX(record_date) FROM bili_video_daily_stats WHERE bvid = v.bvid
      )
      ${whereClause}
      ${havingClause}
    `;

    const orderByClause = orderBy === "pubdate"
      ? `v.pubdate ${orderDirection}`
      : `COALESCE(s.${orderBy}, 0) ${orderDirection}`;

    const [rows] = await pool.query(
      `
        ${baseQuery}
        ORDER BY ${orderByClause}
        LIMIT ? OFFSET ?
      `,
      [...params, parseInt(limit), offset]
    );

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM (${baseQuery}) AS t`, params);
    const totalRowsCount = countRows[0] ? countRows[0].total : 0;

    const uids = [...new Set(rows.map((row) => row.uid))];
    let tagRows = [];
    if (uids.length > 0) {
      const placeholders = uids.map(() => "?").join(", ");
      const [allTags] = await pool.query(
        `
          SELECT
            t.id,
            t.uid,
            t.user_id,
            t.tag_text,
            t.created_at,
            t.updated_at,
            u.username
          FROM bili_vtuber_user_tags t
          JOIN bili_users u ON t.user_id = u.id
          WHERE t.uid IN (${placeholders})
          ORDER BY t.created_at ASC, t.id ASC
        `,
        uids
      );
      tagRows = allTags;
    }

    const tagsByUid = new Map();
    tagRows.forEach((tag) => {
      if (!tagsByUid.has(tag.uid)) {
        tagsByUid.set(tag.uid, []);
      }
      tagsByUid.get(tag.uid).push(tag);
    });

    const items = rows.map((row) => ({
      ...row,
      vtuber_tags: tagsByUid.get(row.uid) || [],
    }));

    res.json({ success: true, data: items, total: totalRowsCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "获取视频库失败" });
  }
});

initMySQL().then(() => {
  app.listen(port, () => {
    console.log(`[Server] 服务已启动 / Auth 模式 - listening on http://localhost:${port}`);
    startWorker();
  });
}).catch((err) => {
  console.error("服务启动失败:", err);
});
