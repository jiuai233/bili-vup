import cors from "cors";
import express from "express";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { BilibiliClient } from "./bilibiliClient.js";

// ================= 数据库配置 =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../../active_vtubers.db");

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("🗄️ ❌ 连接到 active_vtubers.db 发生错误:", err.message);
  } else {
    console.log("🗄️ ✅ 成功连接到活跃主播数据库 (只读并发模式)");
  }
});

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

// ================= 服务端配置 =================
const app = express();
const client = new BilibiliClient();
const port = process.env.PORT || 3001;

app.use(cors());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

// >>> 拥有搜索能力的分页大名单查询 API <<<
app.get("/api/vtubers", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const search = String(req.query.search || "").trim();
    const offset = (page - 1) * pageSize;

    let whereClause = "";
    let params = [];

    // 如果传入了搜索词，执行智能类型判断
    if (search) {
      if (/^\d+$/.test(search)) {
         // 纯数字则同时匹配精确 UID 或模糊名字
         whereClause = "WHERE uid = ? OR uname LIKE ?";
         params.push(parseInt(search), `%${search}%`);
      } else {
         // 非数字仅模糊匹配名字
         whereClause = "WHERE uname LIKE ?";
         params.push(`%${search}%`);
      }
    }

    const countRow = await dbGet(`SELECT COUNT(*) as total FROM active_vtubers ${whereClause}`, params);
    const total = countRow ? countRow.total : 0;

    const vtubers = await dbAll(
      `SELECT uid, roomid, uname, face, video_count, created_at 
       FROM active_vtubers 
       ${whereClause}
       ORDER BY video_count DESC, uid ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      total,
      page,
      pageSize,
      search,
      items: vtubers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "数据库抓取失败", error: String(error) });
  }
});

// 【原接口保留】
app.get("/api/videos", async (request, response) => {
  const uid = String(request.query.uid || "").trim();
  const cookie = String(request.header("x-bilibili-cookie") || "").trim();

  if (!/^\d+$/.test(uid)) {
    response.status(400).json({ message: "uid must be a numeric Bilibili user id." });
    return;
  }

  try {
    const videos = await client.getRecentVideos(uid, 3, { cookie });
    response.json({
      uid,
      count: videos.length,
      videos,
    });
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message === "Bilibili risk control rejected the request. Configure BILIBILI_COOKIE and retry."
        ? "B站触发风控。请为后端设置 BILIBILI_COOKIE 后重试。"
        : error instanceof Error
        ? error.message
        : "Unknown upstream error.";

    response.status(502).json({
      message,
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`);
});
