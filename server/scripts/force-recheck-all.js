import { initMySQL, getPool } from "../src/mysql_db.js";

async function forceRecheck() {
    console.log("🚀 开始解除所有主播的冷却倒计时...");
    try {
        const pool = await initMySQL();
        const [result] = await pool.query("UPDATE bili_vtubers SET next_check_at = CURRENT_TIMESTAMP");
        console.log(`✅ 大成功！已强行重置了 ${result.affectedRows} 位主播的冷却期标志位。`);
        console.log("后台 worker 引擎将在接下来的轮询中，将这批人视为『已到期』并立刻开始进行 3 个月历史的深度扫描！");
        process.exit(0);
    } catch(error) {
        console.error("❌ 发生错误:", error);
        process.exit(1);
    }
}

forceRecheck();
