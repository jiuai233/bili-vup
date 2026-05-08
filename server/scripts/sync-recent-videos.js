import { initMySQL, getPool } from "../src/mysql_db.js";
import { BilibiliClient } from "../src/bilibiliClient.js";
import { decryptCookie } from "../src/crypto.js";
import { getCurrentUnixTimestamp, getShanghaiDateString, getShanghaiTodayAndYesterday } from "../src/time.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runSyc() {
  console.log("🚀 [Scheduler] 开始执行一期潜伏队列拾取任务...");
  try {
    const pool = getPool();
    const client = new BilibiliClient();
    const { today } = getShanghaiTodayAndYesterday();
    const retentionCutoff = getShanghaiDateString(-30);
    const nowUnix = getCurrentUnixTimestamp();

    // 0. 执行自净能力：每次轮询前自动剔除 30 天前的数据快照，防止历史累积拖垮连表查询
    try {
      await pool.query("DELETE FROM bili_creator_daily_stats WHERE record_date < ?", [retentionCutoff]);
      await pool.query("DELETE FROM bili_video_daily_stats WHERE record_date < ?", [retentionCutoff]);
    } catch(e) {
      console.error("执行自净删除时发生警告 (无视即可):", e);
    }

    // 1. 提取核心受保护配置 (Cookie 与 频率参数)
    const [configRows] = await pool.query("SELECT config_key, config_value FROM bili_system_config");
    const sysConfig = {};
    configRows.forEach(row => { sysConfig[row.config_key] = row.config_value; });

    let COOKIE = process.env.BILIBILI_COOKIE || "";
    if (sysConfig['bili_cookie_encrypted']) {
        COOKIE = decryptCookie(sysConfig['bili_cookie_encrypted']) || COOKIE;
    } else if (sysConfig['bili_cookie']) {
        // Fallback for old plaintext cookies
        COOKIE = sysConfig['bili_cookie'];
    }
    if (!COOKIE || COOKIE.trim() === '') {
        console.error("❌ 严重警告：在 bili_system_config 中未能读取到 B站 Cookie，任务取消以防封禁。");
        return false;
    }
    
    // 这些参数可以通过控制台设定，如果没设定也有默认值
    const minFans = parseInt(sysConfig['min_fans_limit'] || 2000);
    const delayMs = parseInt(sysConfig['fetch_delay_ms'] || 2500);

    // 2. 从主库依条件索要出排长蛇阵的 UP 主名单
    // 处理逻辑：只提取那些已经抵达或者超过 next_check_at 期限的主播！
    const [targets] = await pool.query(`
      SELECT v.uid, v.uname, v.priority
      FROM bili_vtubers v
      WHERE v.is_active = 1
      AND (
        UNIX_TIMESTAMP(v.next_check_at) <= ?
        OR NOT EXISTS (
          SELECT 1
          FROM bili_creator_daily_stats s
          WHERE s.uid = v.uid AND s.record_date = ?
        )
      )
      AND (
        COALESCE((SELECT follower_count FROM bili_creator_daily_stats WHERE uid = v.uid ORDER BY record_date DESC LIMIT 1), 99999999) >= ?
        OR
        COALESCE((SELECT follower_count FROM bili_creator_daily_stats WHERE uid = v.uid ORDER BY record_date DESC LIMIT 1), 99999999) = 0
      )
      ORDER BY v.priority DESC, v.next_check_at ASC
    `, [nowUnix, today, minFans]);

    console.log(`🎯 [Scheduler] 装备 Cookie 完毕。共有 ${targets.length} 位 UP 主纳入调度规划 (粉丝门槛: ${minFans})。防风控周期: ${delayMs}ms`);
    
    let successCount = 0;

    // 3. 开始执行逐个遍历打快照
    for (let i = 0; i < targets.length; i++) {
        const user = targets[i];
        console.log(`[${i + 1}/${targets.length}] 正在爬取 ${user.uname} (UID: ${user.uid})...`);

        try {
            // 拉取当前档案、粉丝和视频计数，避免 UP 主改名后本地昵称长期滞后
            const [userProfile, userStat] = await Promise.all([
                client.getUserProfile(user.uid, { cookie: COOKIE }).catch((error) => {
                    console.warn(`  ⚠️ 档案刷新失败，保留旧昵称 (${user.uid}): ${error.message}`);
                    return null;
                }),
                client.getUserStat(user.uid, { cookie: COOKIE }),
            ]);

            if (userProfile?.uname) {
                await pool.query(`
                    UPDATE bili_vtubers
                    SET uname = ?, face = ?, sign = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE uid = ?
                `, [
                    userProfile.uname,
                    userProfile.face || "",
                    userProfile.sign || "",
                    user.uid,
                ]);
            }

            await pool.query(`
                INSERT INTO bili_creator_daily_stats (uid, record_date, follower_count, video_count)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    follower_count = VALUES(follower_count), video_count = VALUES(video_count)
            `, [user.uid, today, userStat.follower_count, userStat.video_count]);
            
            // 下方变更为：抓取最近 3 个月内的所有视频存入快照
            const recentVideos = await client.getRecentVideos(user.uid, 3, { cookie: COOKIE });
            
            if (recentVideos.length === 0) {
                console.log(`  ➖ 近3个月没有任何公开稿件`);
            } else {
                for (const vid of recentVideos) {
                    // a) 存入静止不变的视频主表 (只插不再改)
                    await pool.query(`
                        INSERT IGNORE INTO bili_videos (bvid, uid, title, cover_pic, pubdate)
                        VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))
                    `, [vid.bvid, user.uid, vid.title, vid.pic, vid.created]);

                    // b) 打一份专门属于今天的属性快照 
                    //    如果有评论数等信息可以一并存入
                    await pool.query(`
                        INSERT INTO bili_video_daily_stats (bvid, record_date, view_count, reply_count)
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            view_count = VALUES(view_count), reply_count = VALUES(reply_count)
                    `, [vid.bvid, today, vid.play, vid.comment]);
                }
                console.log(`  📦 极速存留 ${recentVideos.length} 条近三个月视频数据并打上快照！`);
            }

            // 打上时间戳，压到长队末尾。优先用户每4小时查一次，普通用户每24小时查一次
            const currentUnix = getCurrentUnixTimestamp();
            await pool.query(`
                UPDATE bili_vtubers 
                SET next_check_at = FROM_UNIXTIME(?),
                    last_checked_at = FROM_UNIXTIME(?),
                    follower_count = ?,
                    recent_video_count = ?
                WHERE uid = ?
            `, [
                currentUnix + ((Number(user.priority) > 0 ? 4 : 24) * 3600),
                currentUnix,
                userStat.follower_count,
                recentVideos.length,
                user.uid
            ]);
            successCount++;
        } catch (e) {
            console.error(`  ❌ 发生风险性拦截或崩溃 (${user.uid}):`, e.message);
            if (e.message.includes("风控") || e.message.includes("403")) {
                console.log("  ⚠️ [风控预警] 遭遇强力防御网，强制熔断 30 秒以恢复信誉值...");
                await sleep(30000);
            }
        }

        // 浮动休眠保护
        const delay = delayMs + Math.random() * 500;
        await sleep(delay);
    }

    console.log(`✅ [Scheduler] 本次完整调度周期结束！成功扫列了 ${successCount}/${targets.length} 人。休息中...`);
    return true;

  } catch (err) {
    console.error("致命调度挂载失败:", err);
    return false;
  }
}

// 兼容遗留的单次命令行调用
if (process.argv[1] === new URL(import.meta.url).pathname) {
   initMySQL().then(() => runSyc().then(() => process.exit(0)));
}
