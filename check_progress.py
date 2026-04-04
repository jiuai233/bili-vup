import sqlite3
import os
import time

BASE_DB_FILE = "stream_system.db"
NEW_DB_FILE = "active_vtubers.db"

def check_progress():
    if not os.path.exists(NEW_DB_FILE):
        print(f"[{NEW_DB_FILE}] 尚未产生任何数据或文件不存在！")
        return

    try:
        # 获取大表总人数
        with sqlite3.connect(BASE_DB_FILE) as conn:
            total_anchors = conn.execute("SELECT COUNT(uid) FROM anchors").fetchone()[0]
            
        # 获取已扫描人数的初值
        with sqlite3.connect(NEW_DB_FILE) as db:
            checked_count_start = db.execute("SELECT COUNT(uid) FROM check_log").fetchone()[0]
            
        print("⏱️  正在采集实时速度，请稍候约 3 秒钟...")
        time.sleep(3)
        
        # 3秒后再取一次，算出实际速度
        with sqlite3.connect(NEW_DB_FILE) as db:
            checked_count = db.execute("SELECT COUNT(uid) FROM check_log").fetchone()[0]
            active_count = db.execute("SELECT COUNT(uid) FROM active_vtubers").fetchone()[0]
            
        speed = (checked_count - checked_count_start) / 3.0
        percent = (checked_count / total_anchors) * 100 if total_anchors > 0 else 0
        remain_count = total_anchors - checked_count
        
        # 预估剩余时间
        if speed > 0:
            eta_seconds = remain_count / speed
            eta_hours = eta_seconds / 3600
        else:
            eta_hours = 0
        
        print(f"\n📊 【实时扫描进度面板】")
        print(f"=====================================")
        print(f"🗂️ 原始大表总人数 : {total_anchors} 人")
        print(f"✅ 当前已检测人数 : {checked_count} 人 ({percent:.2f}%)")
        print(f"⭐ 达标 (视频>2)  : {active_count} 人")
        print(f"⏳ 剩余待检测人数 : {remain_count} 人")
        print(f"🚀 当前每秒检测速 : {speed:.2f} 人/秒")
        print(f"=====================================")
        
        if checked_count > 0:
            active_rate = (active_count / checked_count) * 100
            print(f"💡 当前整体达标率大概在 {active_rate:.1f}% 左右。")
            if speed > 0:
                print(f"🎯 预估跑完全程还需约: 【 {eta_hours:.1f} 小时 】")
            
    except Exception as e:
        print(f"读取数据库时发生错误: {e}")

if __name__ == "__main__":
    check_progress()
