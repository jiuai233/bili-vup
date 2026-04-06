import { getPool } from './mysql_db.js';
import { BilibiliClient } from './bilibiliClient.js';
import { decryptCookie } from './crypto.js';

let isJobRunning = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function startJobRunner() {
    console.log(`⚙️ [JobWorker] 导入任务专职轮询系统已拉起 (心跳频率: 10秒)...`);
    
    setInterval(async () => {
        if (isJobRunning) return;
        
        try {
            const pool = getPool();
            // Lock a pending task
            const [pendingJobs] = await pool.query("SELECT * FROM bili_import_jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1");
            if (pendingJobs.length === 0) return;
            
            const job = pendingJobs[0];
            isJobRunning = true;
            
            await pool.query("UPDATE bili_import_jobs SET status = 'running' WHERE id = ?", [job.id]);
            console.log(`[JobWorker] 开始处理关注列表导入任务 #${job.id} (目标UID: ${job.target_uid})`);
            
            await processFollowingsImport(job, pool);
            
        } catch (error) {
            console.error(`[JobWorker] 轮询出错:`, error);
        } finally {
            isJobRunning = false;
        }
    }, 10000);
}

async function processFollowingsImport(job, pool) {
    const client = new BilibiliClient();
    
    let cookie = job.cookie_override;
    if (cookie && cookie.trim() !== '') {
        cookie = decryptCookie(cookie.trim()) || cookie.trim();
    }
    
    if (!cookie || cookie.trim() === '') {
        // Fallback to system default (checking encrypted first)
        const [configRows] = await pool.query("SELECT config_key, config_value FROM bili_system_config WHERE config_key IN ('bili_cookie', 'bili_cookie_encrypted')");
        const sysConfig = {};
        configRows.forEach(row => { sysConfig[row.config_key] = row.config_value; });
        
        if (sysConfig['bili_cookie_encrypted']) {
            cookie = decryptCookie(sysConfig['bili_cookie_encrypted']);
        } 
        if (!cookie && sysConfig['bili_cookie']) {
            cookie = sysConfig['bili_cookie'];
        }
    }
    
    let page = 1;
    let totalImported = 0;
    
    try {
        while (true) {
            console.log(`[JobWorker] #${job.id} 正在拉取第 ${page} 页...`);
            const response = await client.getFollowingsPage(job.target_uid, page, { cookie });
            
            const list = response.list;
            if (!list || list.length === 0) {
                console.log(`[JobWorker] #${job.id} 没有更多数据，分页结束。`);
                break;
            }
            
            // Insert into bili_vtubers
            for (const user of list) {
                const uid = user.mid;
                const uname = user.uname;
                const sign = user.sign;
                const face = user.face;
                
                await pool.query(`
                    INSERT INTO bili_vtubers (uid, uname, face, sign)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        uname = VALUES(uname), 
                        face = VALUES(face), 
                        sign = VALUES(sign),
                        updated_at = NOW();
                `, [uid, uname, face, sign]);
            }
            
            totalImported += list.length;
            
            // Update progress
            await pool.query("UPDATE bili_import_jobs SET progress_page = ?, imported_count = ? WHERE id = ?", [page, totalImported, job.id]);
            
            page++;
            
            // Wait 2 seconds to avoid rate limiting
            await sleep(2000);
        }
        
        // Mark as done
        await pool.query("UPDATE bili_import_jobs SET status = 'done', cookie_override = NULL WHERE id = ?", [job.id]);
        console.log(`[JobWorker] #${job.id} 恭喜完成！共导入/更新 ${totalImported} 人。`);
        
    } catch (error) {
        console.error(`[JobWorker] #${job.id} 执行失败:`, error);
        const errMsg = error instanceof Error ? error.message : String(error);
        await pool.query("UPDATE bili_import_jobs SET status = 'failed', error_message = ?, cookie_override = NULL WHERE id = ?", [errMsg, job.id]);
    }
}

