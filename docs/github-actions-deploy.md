# GitHub Actions 部署说明

这个项目按“Vite 静态前端 + Express API 后端”的方式部署。

当前方案不依赖宝塔。推送代码后，GitHub Actions 会通过 SSH 自动完成：

- 构建 `web/dist`
- 上传前端和后端代码
- 保留服务器已有的 `server/.env`
- 写入 `/etc/nginx/conf.d/vup-web.conf`
- reload Nginx
- 安装后端生产依赖
- 用 PM2 重启后端

`.env` 不由 GitHub Actions 生成或覆盖。它属于服务器运行时配置，应该由你在服务器上创建和维护。

## 需要配置的 GitHub Secrets

在仓库的 `Settings -> Secrets and variables -> Actions -> Repository secrets` 里添加：

| Secret | 示例 | 说明 |
| --- | --- | --- |
| `SSH_HOST` | `1.2.3.4` | 服务器 IP 或域名。 |
| `SSH_USER` | `root` | 建议用 `root`，或有免密 `sudo` 权限的用户。 |
| `SSH_PORT` | `22` | SSH 端口。 |
| `SSH_PRIVATE_KEY` | private key text | SSH 用户对应的私钥内容。 |
| `DEPLOY_PATH` | `/www/vup-web` | 项目部署到服务器上的目录。 |
| `APP_DOMAIN` | `vup.example.com` | Nginx 的 `server_name`，也可以填服务器 IP。 |
| `APP_PORT` | `3009` | 后端 Express 监听端口，必须和服务器 `server/.env` 里的 `PORT` 一致。 |

## 可选 GitHub Variables

在 `Settings -> Secrets and variables -> Actions -> Variables` 里可以添加：

| Variable | 示例 | 说明 |
| --- | --- | --- |
| `AUTO_INSTALL_SERVER_DEPS` | `true` | 第一次部署时自动安装 Node.js 20、Nginx、MySQL、PM2。默认 `false`。 |

## 服务器目录结构

推荐把运行目录固定为：

```text
/www/vup-web
```

部署后的目录分层：

```text
/www/vup-web/
  web/
    dist/              # 前端构建产物，由 Actions 覆盖
  server/
    src/               # 后端源码，由 Actions 覆盖
    scripts/           # 后端脚本，由 Actions 覆盖
    package.json       # 由 Actions 覆盖
    package-lock.json  # 由 Actions 覆盖
    node_modules/      # 服务器 npm ci 生成，不提交
    .env               # 你手动维护，Actions 不覆盖
```

临时上传包：

```text
/www/vup-web/deploy.tar.gz
```

部署完成后会自动删除。

## 服务器运行时配置

第一次部署前，你需要在服务器上创建：

```bash
mkdir -p /www/vup-web/server
nano /www/vup-web/server/.env
```

示例：

```bash
PORT=3009
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=vup_user
DB_PASSWORD=your-password
DB_NAME=bilibili_data
JWT_SECRET=long-random-string
PLUGIN_SECRET=long-random-string
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=your-admin-password
BILIBILI_COOKIE=
```

如果 `AUTO_INSTALL_SERVER_DEPS=true`，workflow 会尝试自动安装：

- Node.js 20 or newer
- npm
- pm2
- MySQL
- Nginx

MySQL 用户和密码需要你提前配置好，并写入 `server/.env`。后端启动时会自动创建 `DB_NAME` 数据库和表结构，所以该 MySQL 用户需要有创建数据库和建表权限。

SSH 用户需要能执行这些操作：

- 写入 `DEPLOY_PATH`
- 执行 `sudo tee /etc/nginx/conf.d/vup-web.conf`
- 执行 `sudo nginx -t`
- 执行 `sudo systemctl reload nginx`
- 如果启用自动安装，还要能执行 `sudo apt-get ...`

## Workflow 会做什么

当代码推送到 `main` / `master`，或手动触发 `workflow_dispatch` 时，它会：

1. 安装前端和后端依赖。
2. 构建 `web/dist`。
3. 上传 `web/dist` 和 `server` 源码到 `DEPLOY_PATH`。
4. 检查服务器上是否存在 `server/.env`。
5. 自动写入 Nginx 配置到 `/etc/nginx/conf.d/vup-web.conf`。
6. 检查并 reload Nginx。
7. 在服务器执行 `npm ci --omit=dev`。
8. 在 `DEPLOY_PATH/server` 下执行 `pm2 startOrReload ecosystem.config.cjs --env production` 重启 API。

## 首次上线流程

1. 把域名解析到服务器 IP。
2. 确认 GitHub Secrets 已完整配置。
3. 在服务器创建 `/www/vup-web/server/.env`。
4. 准备好 MySQL 用户和密码。
5. 如果是干净 Ubuntu/Debian 服务器，把 `AUTO_INSTALL_SERVER_DEPS` 设为 `true`。
6. 推送代码到 `main` 或 `master`。
7. 到 GitHub `Actions -> Deploy` 查看运行结果。
8. 浏览器访问 `http://APP_DOMAIN`。
