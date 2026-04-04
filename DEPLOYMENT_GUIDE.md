# Vup Web 项目生产环境独立部署指南

本篇将指导您在一台纯净的 Linux / Windows 服务器上如何通过 `pm2` 持久化守护后台 Node.js API，同时使用最高效的 `Nginx` 将由 Vite 打包出来的前端静态资产暴露到公网，并反向代理给您的 API 后端。

## 前置准备构建
由于您的前端 `web` 是构建在极速的 Vite 之上的，所以在上生产环境的第一步，必须执行构建命令生成产出的静态内容夹 (`dist`):

```bash
cd ./web
npm install
npm run build
```
执行完毕后，`web` 目录内会多出一个包含了所有高压缩核心逻辑代码的 `dist/` 文件夹。

---

## 1. PM2 部署 Node 后端

在此目录的**服务端项目路径** `server` 内，创建以下文件 `ecosystem.config.cjs`以供 PM2 使用多线程集群机制常驻我们的 Express 后端：

📂 **`server/ecosystem.config.cjs`** (文件内容如下👇)
```javascript
module.exports = {
  apps: [
    {
      name: "vup-web-api", // PM2 进程面板中显示的华丽网关名
      script: "./src/index.js",
      instances: 1, // Node 集群实力，若想要扛大并发可设为 "max"
      exec_mode: "cluster", // 集群分离模式
      watch: false, // 生产环境绝不能开启热启
      max_memory_restart: "1G", // 防爆破保障机制
      env_production: {
        NODE_ENV: "production",
        PORT: 3001, // 供内部代理桥接使用的后端口子
      },
    },
  ],
};
```

**部署启动命令：**
```bash
# 全局安装守护灵组件 (若服务器没安的话)
npm install pm2 -g

# 进到带这个文件的后端目录
cd server

# 一键启动接管生死状
pm2 start ecosystem.config.cjs --env production

# （可选）让它开机自启动守护
pm2 startup
pm2 save
```

---

## 2. Nginx 配置 (前后端大一统代理)

Nginx 是整套链路的咽喉。他负责拦截所有的 80/443 请求，把请求页面的流量转给静态文件夹（闪电级速度），把请求 API 数据的流量暗自转发给刚才 PM2 起的 3001 后端，最终做到前端后端的同源跨域完美统一。

找到您宿主机的 `/etc/nginx/nginx.conf` 或者 `/etc/nginx/conf.d/vup-web.conf` 文件，注入如下配置：

📂 **`vup-web.conf`**
```nginx
server {
    listen 80;
    server_name vup.yourdomain.com; # 👉 这里填写您买好的公网域名或服务器的外网IP

    # ==========================
    # 模块 1：承载纯前端静态页面
    # ==========================
    location / {
        # 👉 必须非常精确地指向您的 Web 目录在服务器上打包出的 dist 文件夹全绝对路径！！！
        root /www/vup-web/web/dist; 
        index index.html index.htm;
        
        # 让所有单页应用路由 fallback 回去重新分配
        try_files $uri $uri/ /index.html;
    }

    # ==========================
    # 模块 2：反向代理给 PM2 接管的接口后端
    # ==========================
    location /api/ {
        # 我们上方 PM2 配置中默认起的是 3001 端口
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        
        # WebSocket 支持与头信息真实 IP 透传
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

配置完毕后在服务器上重载规则：
```bash
# 检测配置拼写合法性
nginx -t

# 无缝重载配置，不中断一切线上连接
nginx -s reload
```
大功告成！架构完美闭环。
