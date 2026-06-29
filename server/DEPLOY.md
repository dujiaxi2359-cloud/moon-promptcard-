# 后端上线部署指南（让内置服务对所有用户可用）

目标：把 `server/` 部署到一个**公网 HTTPS 地址**（例如 `https://api.yourdomain.com`），把千问 key 放在服务器环境变量里，然后扩展把 `BUILTIN_API_BASE_URL` 指向它。

## 选平台（按你的用户在哪）

| 场景 | 推荐 | 说明 |
| --- | --- | --- |
| 用户主要在国内 | 阿里云 ECS（香港地域）或阿里云函数计算 FC | 和千问同生态、国内访问快；香港地域免 ICP 备案。大陆地域绑域名需备案。 |
| 全球 / 先跑通测试 | Render、Railway、Fly.io | 几分钟拿到 HTTPS 域名，控制台填环境变量，最省事。 |

> 注意：千问 DashScope 国内可直连；如果后端部署在海外，后端→DashScope 这一跳通常仍可达，但用户→后端这一跳在国内访问海外会慢。面向国内用户优先香港/国内节点。

## 方式一：Render（最省事，示例）

1. 把整个项目（含 `server/`）推到一个 GitHub 仓库。
2. Render → New → Web Service → 连接该仓库，Root Directory 选 `server`。
3. Build Command：`npm install`；Start Command：`npm start`。
4. 先创建数据库：Render → New → PostgreSQL（免费档），创建后复制它的 **Internal Database URL**。
5. 回到 Web Service，在 Environment 里加变量（**不要把 key 写进代码或提交**）：
   - `LLM_BASE_URL = https://dashscope.aliyuncs.com/compatible-mode/v1`
   - `LLM_API_KEY = 你的千问 key`
   - `LLM_TEXT_MODEL = qwen-plus`
   - `LLM_VISION_MODEL = qwen-vl-plus`
   - `DATABASE_URL = 上一步复制的 Postgres 连接串`
   - `JWT_SECRET = 一段随机长字符串`（如 `openssl rand -hex 32` 生成）
   - `SMTP_URL = smtps://用户名:密码@smtp.你的邮箱服务:465`（接真实邮件验证码）
   - `MAIL_FROM = Moon PromptCard <no-reply@你的域名>`
   - `FREE_QUOTA = 20`
   - `NODE_ENV = production`
   - `CORS_ORIGINS = chrome-extension://<你的扩展ID>`（上架拿到 ID 后再填；先可留空放开）
6. 部署完成后得到 `https://xxx.onrender.com`，浏览器访问 `https://xxx.onrender.com/api/health` 应返回 `{"ok":true,"llm":true,...}`；启动日志应显示「存储: Postgres（已连接）」。

> 没填 `SMTP_URL` 时仍是 dev 邮件模式（验证码打印在服务端日志、随响应返回 devCode）——上线发给真实用户前务必配 SMTP。

## 方式二：阿里云 ECS（国内/香港，用 Docker）

1. 开一台 ECS（香港地域免备案），装 Docker。
2. 上传 `server/` 到服务器，在该目录：
   ```bash
   docker build -t moon-server .
   docker run -d --restart=always -p 8787:8787 \
     -e LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 \
     -e LLM_API_KEY=你的千问key \
     -e LLM_TEXT_MODEL=qwen-plus \
     -e LLM_VISION_MODEL=qwen-vl-plus \
     -e NODE_ENV=production \
     moon-server
   ```
3. 前面挂 Nginx 反代到 8787，并用 Let's Encrypt（certbot）或阿里云证书配 HTTPS，绑定域名 `https://api.yourdomain.com`。
4. 访问 `https://api.yourdomain.com/api/health` 验证。

## 部署后告诉我地址

我把扩展 `src/lib/api.ts` 的 `BUILTIN_API_BASE_URL` 改成你的 HTTPS 地址、重新 `npm run build` 并打包上架 zip。

## 持久化与邮件（已内置，配环境变量即启用）

- **持久化**：已支持 Postgres。设了 `DATABASE_URL` 就用数据库（用户/次数持久），不设则内存兜底（仅本地）。token 已改为无状态签名（设 `JWT_SECRET` 后重启不掉登录）。
- **邮件验证码**：已支持 SMTP（nodemailer）。设了 `SMTP_URL` 就发真实邮件，不设则 dev 模式（控制台打印 + 响应带 devCode，仅 NODE_ENV≠production 时返回）。

## 部署后告诉我地址，我把扩展指过去并打包上架 zip。
