import time
import urllib.parse
import hashlib
import requests
import json
import sys

# ========== 完全独立免依赖版本 ==========
# 直接把 GetInfo 里的配置独立出来，这样就不需要 import GetInfo 导致崩溃了

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/137.0.0.0 Safari/537.36")

COOKIE = ("buvid3=88058E96-DDCD-D160-E8C0-0F108134F02345740infoc; b_nut=1746710445; _uuid=A864610F7-BDDD-106A3-4842-ED87C2410482A45708infoc; header_theme_version=CLOSE; enable_web_push=DISABLE; enable_feed_channel=ENABLE; LIVE_BUVID=AUTO5117467145965653; org_id=4822; fingerprint=250a2389c24a4271ae5996de99b250c4; buvid_fp_plain=undefined; buvid_fp=250a2389c24a4271ae5996de99b250c4; PVID=2; CURRENT_QUALITY=0; theme-tip-show=SHOWED; buvid4=9FE58B70-4622-8228-D8CA-4610E5753F5A46218-025050821-XYKbbEbOhMz+2B81VJgc9Q%3D%3D; rpdid=|(k|k)~ul~YJ0J'u~YYYYukuk; theme-avatar-tip-show=SHOWED; theme-switch-show=SHOWED; CURRENT_FNVAL=2000; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU0MDUxOTAsImlhdCI6MTc3NTE0NTkzMCwicGx0IjotMX0.gM-hKBOomsErbqyNWzqOmwnF0ye7xXxZaJvhJVM2fT8; bili_ticket_expires=1775405130; home_feed_column=5; SESSDATA=91284171%2C1790698021%2C85ae4%2A42CjCG1z1FHO8YtLZJwC-KHizGa0o7yPZIaxAPoE-6_GKQRKh3SuFdbD6SSL1p9fvXcoYSVkJacHRrN1lqd251aTJFTHVrUTQzUzB4M3JVU2ZLQ1FQVU5sWE1GcGVLQm1tUzVWVDVYYmJTSUpWY1pQOGtZSEhxUkEyUHhTMWN5ei1wUE56VFRHelRBIIEC; bili_jct=6a3db6d54fd59588713f51ba2a83fbb2; DedeUserID=3546376367508093; DedeUserID__ckMd5=ead1d6b6627c9644; sid=hf30ecod; browser_resolution=1997-1225; bp_t_offset_3546376367508093=1187084537767657472; b_lsid=DEFD679A_19D53D86608")

sess = requests.Session()
sess.trust_env = False # 强制忽略 Windows 系统代理/注册表里的残留配置，纯直连
sess.headers.update({
    "User-Agent": UA,
    "Cookie": COOKIE,
    "Referer": "https://space.bilibili.com/",
    "Origin":  "https://space.bilibili.com",
    "Accept":  "application/json, text/plain, */*",
})

TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,
       33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,
       26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,
       34,44,52]

def _mixin(a: str, b: str) -> str:
    return ''.join((a + b)[i] for i in TAB)[:32]

def _wbi_keys() -> tuple:
    j = sess.get("https://api.bilibili.com/x/web-interface/nav", timeout=8).json()
    img = j["data"]["wbi_img"]["img_url"].split('/')[-1].split('.')[0]
    sub = j["data"]["wbi_img"]["sub_url"].split('/')[-1].split('.')[0]
    return img, sub

def _sign(params: dict, mix_key: str) -> None:
    params["wts"] = str(int(time.time()))
    ordered = [(k, ''.join(ch for ch in str(v) if ch not in "!'()*"))
               for k, v in sorted(params.items())]
    params["w_rid"] = hashlib.md5((urllib.parse.urlencode(ordered) + mix_key).encode()).hexdigest()

def test_navnum(mid):
    print(f"==========================================")
    print(f"正在测试获取 UID: {mid} 的空间统计数据...")
    print(f"==========================================")
    
    try:
        img, sub = _wbi_keys()
        # 注意：既然原仓库 getwebid 缺失，我们其实可以直接先传空字符串 "" 或者不传，
        # 在某些情况下 B 站 WBI 是允许 w_webid 为空的，只要 WTS 和 W_RID 签名正确！
        params = {
            "mid": mid,
            "w_webid": "" 
        }
        
        # 自动生成 w_rid 和 wts 签名
        _sign(params, _mixin(img, sub))
        
        url = "https://api.bilibili.com/x/space/navnum"
        print(f"👉 发起请求 URL: {url}")
        print(f"👉 携带鉴权参数: {params}\n")
        
        # 发送请求
        res = sess.get(url, params=params, timeout=10)
        print(f"HTTP 状态码: {res.status_code}")
        
        # 解析返回的数据
        data = res.json()
        print("\n👇 接口完整返回 JSON 数据如下:")
        print(json.dumps(data, ensure_ascii=False, indent=4))
        
        print("\n----------------结论-----------------")
        if data.get("code") == 0:
            video_count = data["data"].get("video", 0)
            print(f"✅ 测试成功！完全打通。成功提取到此人的视频投稿数量：【 {video_count} 】 个")
        else:
            print(f"❌ 测试受阻。接口返回错误码: {data.get('code')}")
            
    except Exception as e:
        print(f"\n❌ 请求直接报错发生异常: {e}")

if __name__ == "__main__":
    # 默认测试 哔哩哔哩官方 (UID: 8047632)
    test_uid = 8047632 
    if len(sys.argv) > 1:
        try:
            test_uid = int(sys.argv[1])
        except ValueError:
            print("请输入数字形态的 UID!")
            sys.exit(1)
            
    test_navnum(test_uid)
