import requests
import pymysql
import time

# 数据库配置
DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root', # 替换为你的MySQL用户名
    'password': '123456', # 替换为你的MySQL密码
    'database': 'bilibili_data',
    'charset': 'utf8mb4'
}

# B站配置
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    # 必须带上已登录的Cookie (需要有SESSDATA)
    "Cookie": "buvid3=C53385FE-3240-9FCA-217B-A3AA7106901461122infoc; b_nut=1775401161; _uuid=E4A433A2-11092-110D4-39DF-F2B9DC4102281061415infoc; home_feed_column=5; buvid_fp=a8cfd30117cdf2f3852000afcdfa187b; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU2NjAzNjIsImlhdCI6MTc3NTQwMTEwMiwicGx0IjotMX0.4SvRY9GuTXcDeUoEnJFW5x1O3HlcXwtjmsRkI4W0eo0; bili_ticket_expires=1775660302; buvid4=D88A2190-C037-B2EE-1E19-B00002C6CE7462413-026040522-bvHJrsSja8gM7Af8WbZt/w%3D%3D; SESSDATA=bb08a384%2C1790953180%2C2eb78%2A42CjDmomMdOyoPAnjhUXT07riNbB-rfQKCArA7pflyi-2MHUZjxvf6uqG0JrVfAm_gj4QSVmc0NDhkeDQwZzF0c1NLamlsNVFjdTF3aHpvc2RTQUFVNG1hSmQyajNvaGVOcXVJUWpOU0J3Y255WlBBQXgwVXRSRkYwMFdVcm9IbzlrYTRuNklkaUl3IIEC; bili_jct=87dc9b4489c8d78979718b876986febc; DedeUserID=3723075; DedeUserID__ckMd5=308eb86b46c1b27c; sid=mt50ej18; theme-tip-show=SHOWED; b_lsid=F20679BD_19D5E28221E; browser_resolution=1855-1271" 
}
VMID = "3723075" # 目标获取关注列表的UID

def init_db():
    try:
        # 连接到MySQL服务器 (初始不指定数据库)
        conn = pymysql.connect(
            host=DB_CONFIG['host'],
            port=DB_CONFIG['port'],
            user=DB_CONFIG['user'],
            password=DB_CONFIG['password'],
            charset=DB_CONFIG['charset']
        )
        cursor = conn.cursor()
        
        # 如果库不存在则自动创建，支持emoji这种的utf8mb4编码
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_CONFIG['database']}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.select_db(DB_CONFIG['database'])
        
        # 创建关注列表数据表
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS followings (
            uid BIGINT PRIMARY KEY COMMENT '用户UID',
            uname VARCHAR(255) NOT NULL COMMENT '昵称',
            sign TEXT COMMENT '签名',
            face VARCHAR(500) COMMENT '头像URL',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='B站关注列表';
        """
        cursor.execute(create_table_sql)
        conn.commit()
        return conn
    except Exception as e:
        print(f"数据库初始化失败: {e}")
        return None

def fetch_and_save_followings():
    conn = init_db()
    if not conn:
        return
        
    cursor = conn.cursor()
    url = "https://api.bilibili.com/x/relation/followings"
    
    pn = 1    # 从第1页开始
    ps = 50   # B站关注列表API最大长度通常是50
    total_inserted = 0
    
    print("开始拉取关注列表数据...")
    
    while True:
        print(f"正在获取第 {pn} 页...")
        params = {
            "vmid": VMID,
            "pn": pn,
            "ps": ps,
            "order": "desc"
        }
        
        try:
            response = requests.get(url, headers=HEADERS, params=params, timeout=10, proxies={"http": None, "https": None})
            data = response.json()
            
            if data['code'] != 0:
                print(f"获取失败, Code: {data['code']}, Message: {data['message']}")
                # 有些时候权限不足或者到达尽头会报错，直接跳出循环
                break
            
            user_list = data['data'].get('list')
            if not user_list:
                print("获取完毕，没有更多数据了。")
                break
            
            # 开始批量或逐条写入
            for user in user_list:
                uid = user['mid']
                uname = user['uname']
                sign = user['sign']
                face = user['face']
                
                # 使用 INSERT ... ON DUPLICATE KEY UPDATE 处理重复UID：当记录存在时则更新昵称、签名、头像
                sql = """
                INSERT INTO followings (uid, uname, sign, face)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    uname = VALUES(uname), 
                    sign = VALUES(sign),
                    face = VALUES(face);
                """
                cursor.execute(sql, (uid, uname, sign, face))
                
            conn.commit()
            total_inserted += len(user_list)
            print(f"  -- 第 {pn} 页拉取并入库成功，共新增/更新 {len(user_list)} 条记录，累计处理 {total_inserted} 条。")
            
            pn += 1
            # 礼貌延时防止触发B站风控
            time.sleep(2) 
            
        except requests.exceptions.RequestException as e:
            print(f"网络请求异常: {e}")
            break
        except Exception as e:
            print(f"发生未知异常: {e}")
            break
            
    cursor.close()
    conn.close()
    print(f"执行结束，本次总计拉取并处理 {total_inserted} 条关注记录！")

if __name__ == "__main__":
    # 在运行前请确保安装了依赖: pip install requests pymysql
    fetch_and_save_followings()
