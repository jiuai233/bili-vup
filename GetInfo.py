#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bili_vt_all.py ─ 直接拉"虚拟区 · 全部"主播列表
依赖：requests >= 2.25     运行：python bili_vt_all.py
"""

import time, urllib.parse, hashlib, requests, sqlite3, datetime, random, sys
from typing import Dict, List

# ========== 固定头 & Cookie（完整保留） ==========
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/137.0.0.0 Safari/537.36")

COOKIE = ("buvid3=88058E96-DDCD-D160-E8C0-0F108134F02345740infoc; b_nut=1746710445; _uuid=A864610F7-BDDD-106A3-4842-ED87C2410482A45708infoc; header_theme_version=CLOSE; enable_web_push=DISABLE; enable_feed_channel=ENABLE; LIVE_BUVID=AUTO5117467145965653; org_id=4822; fingerprint=250a2389c24a4271ae5996de99b250c4; buvid_fp_plain=undefined; buvid_fp=250a2389c24a4271ae5996de99b250c4; PVID=2; CURRENT_QUALITY=0; theme-tip-show=SHOWED; buvid4=9FE58B70-4622-8228-D8CA-4610E5753F5A46218-025050821-XYKbbEbOhMz+2B81VJgc9Q%3D%3D; rpdid=|(k|k)~ul~YJ0J'u~YYYYukuk; theme-avatar-tip-show=SHOWED; theme-switch-show=SHOWED; CURRENT_FNVAL=2000; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU0MDUxOTAsImlhdCI6MTc3NTE0NTkzMCwicGx0IjotMX0.gM-hKBOomsErbqyNWzqOmwnF0ye7xXxZaJvhJVM2fT8; bili_ticket_expires=1775405130; home_feed_column=5; SESSDATA=91284171%2C1790698021%2C85ae4%2A42CjCG1z1FHO8YtLZJwC-KHizGa0o7yPZIaxAPoE-6_GKQRKh3SuFdbD6SSL1p9fvXcoYSVkJacHRrN1lqd251aTJFTHVrUTQzUzB4M3JVU2ZLQ1FQVU5sWE1GcGVLQm1tUzVWVDVYYmJTSUpWY1pQOGtZSEhxUkEyUHhTMWN5ei1wUE56VFRHelRBIIEC; bili_jct=6a3db6d54fd59588713f51ba2a83fbb2; DedeUserID=3546376367508093; DedeUserID__ckMd5=ead1d6b6627c9644; sid=hf30ecod; browser_resolution=1997-1225; bp_t_offset_3546376367508093=1187084537767657472; b_lsid=DEFD679A_19D53D86608")

# 从 getwebid.py 导入获取 w_webid 的方法
from getwebid import get_w_webid, HEADERS
HEADERS["User-Agent"] = UA  # 确保 UA 一致

# ========== Session ==========
sess = requests.Session()
sess.headers.update({
    "User-Agent": UA,
    "Cookie": COOKIE,
    "Referer": "https://live.bilibili.com/",
    "Origin":  "https://live.bilibili.com",
    "Accept":  "application/json, text/plain, */*",
})

# ========== WBI 工具 ==========
TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,
       33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,
       26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,
       34,44,52]

def _mixin(a: str, b: str) -> str:
    return ''.join((a + b)[i] for i in TAB)[:32]

def _wbi_keys() -> tuple[str, str]:
    j = sess.get("https://api.bilibili.com/x/web-interface/nav", timeout=8).json()
    img = j["data"]["wbi_img"]["img_url"].split('/')[-1].split('.')[0]
    sub = j["data"]["wbi_img"]["sub_url"].split('/')[-1].split('.')[0]
    return img, sub

def _sign(params: Dict[str, str], mix_key: str) -> None:
    params["wts"] = str(int(time.time()))
    ordered = [(k, ''.join(ch for ch in str(v) if ch not in "!'()*"))
               for k, v in sorted(params.items())]
    params["w_rid"] = hashlib.md5((urllib.parse.urlencode(ordered) + mix_key).encode()).hexdigest()

# ========== 数据库操作 ==========
def setup_database(db_file: str = "vtubers.db"):
    """初始化数据库并创建/更新表结构"""
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='vtubers'")
        table_exists = cursor.fetchone() is not None

        if not table_exists:
            cursor.execute("""
                CREATE TABLE vtubers (
                    uid INTEGER PRIMARY KEY, roomid INTEGER, uname TEXT,
                    face TEXT, user_cover TEXT,
                    created_at TEXT, updated_at TEXT
                )
            """)
            conn.commit()
            return

        cursor.execute("PRAGMA table_info(vtubers)")
        columns_info = cursor.fetchall()
        columns = [col[1] for col in columns_info]
        is_uid_pk = any(col[1] == 'uid' and col[5] == 1 for col in columns_info)

        if not is_uid_pk:
            print("检测到旧版数据库结构，正在迁移数据...")
            temp_table_name = 'vtubers_old'
            try:
                cursor.execute(f"ALTER TABLE vtubers RENAME TO {temp_table_name}")
            except sqlite3.OperationalError as e:
                if "already exists" in str(e):
                    cursor.execute(f"DROP TABLE {temp_table_name}")
                    cursor.execute(f"ALTER TABLE vtubers RENAME TO {temp_table_name}")
                else: raise e
            
            cursor.execute("""
                CREATE TABLE vtubers (
                    uid INTEGER PRIMARY KEY, roomid INTEGER, uname TEXT,
                    face TEXT, user_cover TEXT,
                    created_at TEXT, updated_at TEXT
                )
            """)
            
            now = datetime.datetime.now().isoformat()
            cursor.execute(f"""
                INSERT INTO vtubers (uid, roomid, uname, face, user_cover, created_at, updated_at)
                SELECT uid, roomid, uname, face, user_cover, ?, ? FROM {temp_table_name}
                WHERE uid IS NOT NULL
            """, (now, now))
            
            cursor.execute(f"DROP TABLE {temp_table_name}")
            print("数据库迁移完成。")
        else:
            if 'created_at' not in columns:
                cursor.execute("ALTER TABLE vtubers ADD COLUMN created_at TEXT")
            if 'updated_at' not in columns:
                cursor.execute("ALTER TABLE vtubers ADD COLUMN updated_at TEXT")
        
        conn.commit()


def save_to_db(rooms: List[Dict], db_file: str = "vtubers.db"):
    """将主播数据保存到数据库，新增或更新。"""
    if not rooms:
        return

    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        now = datetime.datetime.now().isoformat()
        
        cursor.execute("SELECT uid, roomid, uname, face, user_cover FROM vtubers")
        existing_vtubers = {row[0]: row[1:] for row in cursor.fetchall()}

        to_insert = []
        to_update = []

        for r in rooms:
            uid = r.get("uid")
            if not uid:
                continue
            
            new_data_tuple = (
                r.get("roomid"),
                r.get("uname"),
                r.get("face"),
                r.get("user_cover")
            )

            if uid not in existing_vtubers:
                to_insert.append((
                    uid, *new_data_tuple, now, now
                ))
            else:
                current_data_tuple = existing_vtubers[uid]
                if new_data_tuple != current_data_tuple:
                    to_update.append((
                        *new_data_tuple, now, uid
                    ))

        if to_insert:
            cursor.executemany("""
                INSERT INTO vtubers (uid, roomid, uname, face, user_cover, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, to_insert)
        
        if to_update:
            cursor.executemany("""
                UPDATE vtubers
                SET roomid = ?, uname = ?, face = ?, user_cover = ?, updated_at = ?
                WHERE uid = ?
            """, to_update)

        conn.commit()
        
        if to_insert or to_update:
            print(f"数据库操作完成：新增 {len(to_insert)} 条，更新 {len(to_update)} 条。")
        else:
            print("没有发现数据更新。")

# ========== 主函数 ==========
def vtuber_all(sort_type: str = "sort_type_1664",
               page: int = 1, page_size: int = 60) -> List[Dict]:
    img, sub = _wbi_keys()
    params = {
        "platform": "web",
        "parent_area_id": 9,
        "area_id": 0,
        "sort_type": sort_type,          # 热门 / TopStar / 最新
        "web_location": "444.253",
        "w_webid": get_w_webid(),        # 自动获取 w_webid
        "page": page,
        "page_size": page_size,
    }
    _sign(params, _mixin(img, sub))
    j = sess.get("https://api.live.bilibili.com/xlive/web-interface/v1/second/getList",
                 params=params, timeout=10).json()
    if j["code"] != 0:
        raise RuntimeError(j)

    d = j["data"]
    return d.get("anchor_info", {}).get("list", d.get("list", []))

def vtuber_page(sort_type="sort_type_1664", page=1, page_size=20):
    # 重试机制
    max_retries = 3
    for retry in range(max_retries):
        try:
            img, sub = _wbi_keys()
            params = {
                "platform":"web", 
                "parent_area_id":9, 
                "area_id":0,
                "sort_type":sort_type,
                "web_location":"444.253",
                "w_webid": get_w_webid(),  # 每次重试都重新获取
                "page":page, 
                "page_size":page_size,
            }
            _sign(params, _mixin(img, sub))
            
            # 添加随机延迟
            time.sleep(0.5 + random.random())
            
            j = sess.get("https://api.live.bilibili.com/xlive/web-interface/v1/second/getList",
                        params=params, timeout=10).json()
            
            if j["code"] == 0:
                d = j["data"]
                return d.get("anchor_info", {}).get("list", d.get("list", []))
            elif j["code"] == -101:
                print("COOKIE 已失效，请更新 COOKIE")
                sys.exit(1)
            elif j["code"] == -352 and retry < max_retries - 1:
                print(f"w_webid 失效，第 {retry + 1} 次重试...")
                # 删除缓存文件
                from getwebid import CACHE
                if CACHE.exists():
                    CACHE.unlink()
                continue
            else:
                raise RuntimeError(j)
                
        except Exception as e:
            if retry < max_retries - 1:
                print(f"发生错误，第 {retry + 1} 次重试: {str(e)}")
                time.sleep(1 * (retry + 1))  # 递增等待时间
                continue
            raise

def vtuber_all_pages(sort_type="sort_type_1664",
                     page_size=20) -> List[Dict]:            # ★ 新增参数
    """自动翻页抓满"""
    page, acc, seen = 1, [], set()
    while True:
        lst = vtuber_page(sort_type, page, page_size)   # 传进去
        if not lst:
            break
        for r in lst:
            rid = r["roomid"]
            if rid not in seen:      # 去重
                acc.append(r)
                seen.add(rid)
        if len(lst) < page_size:               # ← 用 page_size 判断
            break
        page += 1
        time.sleep(0.3)
    return acc

# ========== demo ==========
if __name__ == "__main__":
    DB_FILE = "vtubers.db"
    setup_database(DB_FILE)
    for tag, stype in [("热门","online"),
                       ("TopStar","sort_type_1707"),
                       ("最新","live_time")]:
        print(f"正在抓取 [{tag}] 分类...")
        rooms = vtuber_all_pages(stype)
        print(f"{tag} 共抓取到 {len(rooms)} 个房间")
        save_to_db(rooms, DB_FILE)

       

    with sqlite3.connect(DB_FILE) as conn:
        total = conn.execute("SELECT COUNT(*) FROM vtubers").fetchone()[0]
        print(f"\n数据库 {DB_FILE} 中总计存储了 {total} 位主播。")
