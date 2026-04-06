import { runSyc } from '../scripts/sync-recent-videos.js';

let isRunning = false;
let checkInterval = 5 * 60 * 1000; // 每 5 分钟尝试唤醒一次爬虫队列

export function startWorker() {
    console.log(`⚙️ [Worker] 后台常驻监听系统已拉起 (心跳频率: 5分钟)...`);
    
    // 不断地扫描队头的待爬取任务
    setInterval(async () => {
        if (isRunning) return;
        isRunning = true;
        try {
            await runSyc();
        } catch (error) {
            console.error(`[Worker] 本轮周期崩溃:`, error);
        } finally {
            isRunning = false;
        }
    }, checkInterval);

    // 启动五秒后尝试跑第一轮
    setTimeout(() => {
        if (!isRunning) {
            isRunning = true;
            runSyc().finally(() => { isRunning = false; });
        }
    }, 5000);
}
