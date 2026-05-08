# GitHub Actions 部署实施计划

## 改造范围

- 在 `.github/workflows` 下新增生产部署 workflow。
- 服务器 `.env` 由用户手动维护，workflow 只检查不覆盖。
- 自动写入 Nginx 站点配置并 reload。
- 可选自动安装服务器依赖。
- 新增 GitHub Secrets、Variables 和服务器前置条件说明。
- 不修改应用运行时代码、数据库结构或现有本地部署文件。

## 模块拆分

1. CI/CD workflow
   - 拉取代码、安装依赖、构建前端、打包部署文件。
   - 通过 SSH 上传 release。
   - 检查服务器已有 `server/.env`。
   - 自动写入 `/etc/nginx/conf.d/vup-web.conf`。
   - 用 PM2 重启 Express 后端。

2. 部署文档
   - 列出必需 Secrets。
   - 列出可选自动安装开关。
   - 说明首次上线流程。

## 实施顺序

1. 检查项目结构和部署假设。
2. 新增 workflow。
3. 保留服务器 `.env`，增强 workflow 自动写 Nginx。
4. 更新部署说明。
5. 验证 workflow 核心命令和前端构建。

## 风险点

- 如果 GitHub Secrets 缺失，workflow 会在部署前失败。
- 如果服务器缺少 `server/.env`，workflow 会在重启后端前失败。
- SSH 用户必须有写部署目录和 reload Nginx 的权限。
- 自动安装依赖只覆盖 Ubuntu/Debian 常见环境。

## 回滚点

- 禁用或删除 `.github/workflows/deploy.yml`。
- 删除或恢复 `/etc/nginx/conf.d/vup-web.conf`。
- 手动恢复服务器目录，或重新部署上一个提交。

## 验证方式

- 运行 `npm --prefix web run build` 验证前端构建。
- 运行 `npm --prefix server ls --depth=0` 验证后端依赖可解析。
- 检查新增文件，确认没有上传或覆盖 `.env`，路径和部署动作符合预期。
