import sqlite3
import time
import random
import sys
import datetime
import urllib.parse
import hashlib
import requests
import concurrent.futures
import threading

# ========== 独立配置 ==========

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/137.0.0.0 Safari/537.36")

COOKIE = ("buvid3=88058E96-DDCD-D160-E8C0-0F108134F02345740infoc; b_nut=1746710445; _uuid=A864610F7-BDDD-106A3-4842-ED87C2410482A45708infoc; header_theme_version=CLOSE; enable_web_push=DISABLE; enable_feed_channel=ENABLE; LIVE_BUVID=AUTO5117467145965653; org_id=4822; fingerprint=250a2389c24a4271ae5996de99b250c4; buvid_fp_plain=undefined; buvid_fp=250a2389c24a4271ae5996de99b250c4; PVID=2; CURRENT_QUALITY=0; theme-tip-show=SHOWED; buvid4=9FE58B70-4622-8228-D8CA-4610E5753F5A46218-025050821-XYKbbEbOhMz+2B81VJgc9Q%3D%3D; rpdid=|(k|k)~ul~YJ0J'u~YYYYukuk; theme-avatar-tip-show=SHOWED; theme-switch-show=SHOWED; CURRENT_FNVAL=2000; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU0MDUxOTAsImlhdCI6MTc3NTE0NTkzMCwicGx0IjotMX0.gM-hKBOomsErbqyNWzqOmwnF0ye7xXxZaJvhJVM2fT8; bili_ticket_expires=1775405130; home_feed_column=5; SESSDATA=91284171%2C1790698021%2C85ae4%2A42CjCG1z1FHO8YtLZJwC-KHizGa0o7yPZIaxAPoE-6_GKQRKh3SuFdbD6SSL1p9fvXcoYSVkJacHRrN1lqd251aTJFTHVrUTQzUzB4M3JVU2ZLQ1FQVU5sWE1GcGVLQm1tUzVWVDVYYmJTSUpWY1pQOGtZSEhxUkEyUHhTMWN5ei1wUE56VFRHelRBIIEC; bili_jct=6a3db6d54fd59588713f51ba2a83fbb2; DedeUserID=3546376367508093; DedeUserID__ckMd5=ead1d6b6627c9644; sid=hf30ecod; browser_resolution=1997-1225; bp_t_offset_3546376367508093=1187084537767657472; b_lsid=DEFD679A_19D53D86608")

sess = requests.Session()
sess.trust_env = False 
sess.headers.update({
    "User-Agent": UA,
    "Cookie": COOKIE,
    "Referer": "https://space.bilibili.com/",
    "Origin":  "https://space.bilibili.com",
    "Accept":  "application/json, text/plain, */*",
})

BASE_DB_FILE = "stream_system.db"
NEW_DB_FILE = "active_vtubers.db"

# 增加数据库写入锁，防止多线程并发时 SQLite DB is locked 报错
db_lock = threading.Lock()

def setup_databases():
    with sqlite3.connect(NEW_DB_FILE) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS check_log (
                uid INTEGER PRIMARY KEY,
                video_count INTEGER,
                checked_at TEXT
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS active_vtubers (
                uid INTEGER PRIMARY KEY,
                roomid INTEGER,
                uname TEXT,
                face TEXT,
                user_cover TEXT,
                video_count INTEGER,
                created_at TEXT
            )
        ''')
        conn.commit()

def get_video_count(mid):
    try:
        params = {
            "mid": mid
        }
        # 既然社区验证不需要 WBI 签名也能跑通 navnum，我们就省略 WBI 繁杂消耗，直接请求
        # (如果您把 URL 改成了 " " 会报错，我在这里修复为标准 URL)
        url = "https://api.bilibili.com/x/space/navnum"
        res = sess.get(url, params=params, timeout=5)
        data = res.json()
        
        if data["code"] == 0:
            return data["data"].get("video", 0)
        elif data["code"] in (-352, -403, -101, -412):
            return -2
        else:
            return -1
    except Exception as e:
        return -1

def process_user(user_data):
    uid, uname, room_id, face = user_data
    try:
        count = get_video_count(uid)
        now = datetime.datetime.now().isoformat()
        
        if count >= 0:
            # 引入锁定机制安全并发写入
            with db_lock:
                with sqlite3.connect(NEW_DB_FILE, timeout=30) as db:
                    db.execute("INSERT OR REPLACE INTO check_log (uid, video_count, checked_at) VALUES (?, ?, ?)", (uid, count, now))
                    if count > 2:
                        db.execute("""
                            INSERT OR REPLACE INTO active_vtubers 
                            (uid, roomid, uname, face, user_cover, video_count, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (uid, room_id, uname, face, "", count, now))
                        db.commit()
                        print(f"✅ 达标入库！ {uname} (UID: {uid}) 稿件数: {count}")
                    else:
                        db.commit()
                        print(f"➖ {uname} (UID: {uid}) 稿件 <= 2，不要。")
                        
        elif count == -2:
            print("⚠️ 撞风控 (-352)，当前线程强制挂起避险...")
            time.sleep(5)
             
        # 根据您发来的社区最新经验：单 IP 用 <=3 并发，延时设置 0.5s~0.9s 极度安全！
        sleep_time = 0.5 + random.random() * 0.4
        time.sleep(sleep_time)
        
    except Exception as e:
        print(f"❌ UID {uid} 其他异常: {e}")


def run_filter():
    setup_databases()
    
    with sqlite3.connect(BASE_DB_FILE) as conn:
        conn.execute(f"ATTACH DATABASE '{NEW_DB_FILE}' AS newdb")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.uid, a.uname, a.room_id, a.face
            FROM main.anchors AS a
            LEFT JOIN newdb.check_log AS c ON a.uid = c.uid
            WHERE c.uid IS NULL
        """)
        users = cursor.fetchall()
         
    print(f"\n=============================================")
    print(f"大表 (anchors) 中剩余待排主播数: {len(users)} 个")
    print(f"模式：高并发请求 (3个并发线程) + 社区推荐极速不封号策略")
    print(f"=============================================\n")
    
    # 采用社区推荐并发数量：3 并发，既能把速度拉满，又能保证 IP 稳定
    max_concurrent = 3
    
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_concurrent) as executor:
            # 使用 executor 将 users 指派给线程池执行
            executor.map(process_user, users)
    except KeyboardInterrupt:
        print(f"\n⏹ 已被用户停止。由于采用多线程，进度已在每次小查完时存入 {NEW_DB_FILE} 并在后台中断。")
        sys.exit(0)

if __name__ == "__main__":
    run_filter()
