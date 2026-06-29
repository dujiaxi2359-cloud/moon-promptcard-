# Moon PromptCard 参考后端

为 Moon PromptCard 扩展的「内置服务」提供后端：邮箱登录、配额、提示词分析（Gemini / OpenAI 兼容）、图片生成。**官方模型 Key 只存在本服务的 `.env`，绝不进扩展前端。**

> 这是一份**参考实现**：用户/配额/会话都是内存存储，重启即丢，不能横向扩展。上线前请把 `src/store.js` 换成真实数据库（Postgres/Redis 等），并接入真实邮件与支付。

## 技术栈

Node 18+（用到全局 `fetch`）、Express、CORS。无数据库、无重型依赖，开箱即跑。

## 快速开始

```bash
cd server
npm install
cp .env.example .env     # 然后填写 .env（见下）
npm start                # http://localhost:8787
# 或 npm run dev        # node --watch 热重载
```

未填模型 Key 时，`/api/analyze` 会自动降级为**本地启发式打分**，方便先把登录与前端联调跑通。

## 配置 `.env`

用 OpenAI 兼容网关（如 AI充电站 / aidraw365），文本、文生图、图生图同一套：

```
LLM_BASE_URL=https://aidraw365.com/v1
LLM_API_KEY=（你的网关 key，只放这里）
LLM_TEXT_MODEL=qwen-vl-plus      # 纯文本分析
LLM_VISION_MODEL=qwen-vl-plus    # 带参考图分析（读图）
IMAGE_MODEL=gpt-image-2          # 文生图  -> /v1/images/generations
IMAGE_EDIT_MODEL=nanobanana-2    # 图生图  -> /v1/images/edits
```

图片默认复用上面的 url/key；如需独立供应商再填 `IMAGE_BASE_URL` / `IMAGE_API_KEY`。
分析按"有无参考图"路由：无图用 `LLM_TEXT_MODEL`，有图用 `LLM_VISION_MODEL`。其余项见 `.env.example`。

`CORS_ORIGINS` 开发期可留空（放开所有来源）；上线请填扩展来源 `chrome-extension://<扩展ID>`。

## 接口契约

所有响应均为 JSON；受保护接口需 `Authorization: Bearer <token>`。

| 方法 & 路径 | 鉴权 | 请求体 | 响应 |
| --- | --- | --- | --- |
| `POST /api/auth/request` | 否 | `{ email }` | `{ ok, delivered, devCode? }` |
| `POST /api/auth/verify` | 否 | `{ email, code }` | `{ ok, token, account }` |
| `POST /api/auth/logout` | 可选 | — | `{ ok }` |
| `GET /api/me` | 是 | — | `{ ok, account, plan }` |
| `GET /api/quota` | 是 | — | `{ ok, quota:{ remaining, plan } }` |
| `POST /api/analyze` | 是 | `{ prompt, lang, image? }` | `{ ok, result, remaining }` |
| `POST /api/image/generate` | 是 | `{ prompt, mode, refImage?, size? }` | `{ ok, images:[dataURL|url], remaining }` |
| `POST /api/billing/checkout` | 是 | — | `{ ok, url }` |
| `GET /api/health` | 否 | — | `{ ok, llm, image }` |

`result` 字段结构（与扩展一致）：`score, level, summary, issues[], suggestions[], optimizedPrompt, negativePrompt, tags[], createdAt, source`。

`image`（分析时可选）/ `refImage`（生成时可选）：data URL（`data:image/...;base64,...`）或 http(s) 图片地址。带 `image` 时分析走 VL 视觉模型；带 `refImage` 时生成走图生图 `/v1/images/edits`，否则走文生图 `/v1/images/generations`。

`mode`：`single` 生成 1 张（扣 1 次），`mix` 生成 4 张（扣 4 次）。带参考图的 `mix` 会按四个预设出图：忠实/弱参考、仅参考风格、转 C4D、转黑白线稿。

错误响应统一为 `{ ok:false, error }`，并带合适的 HTTP 状态码：`401` 未登录、`402` 次数不足、`501` 图片未配置、`502` 上游模型错误。不暴露堆栈或 Key。

## 登录流程（开发联调）

1. `POST /api/auth/request {email}` → 开发模式下控制台打印验证码，且响应里带 `devCode`。
2. `POST /api/auth/verify {email, code}` → 拿到 `token`。
3. 后续请求带 `Authorization: Bearer <token>`。

生产环境：把 `src/auth.js` 里的 `sendCode()` 接到真实邮件服务，并去掉 `devCode` 返回（仅 `isDev && 无 SMTP` 时才返回）。

## 上线前替换清单

- `src/store.js` → 真实数据库 / 会话存储。
- `src/auth.js sendCode()` → 真实邮件发送。
- `/api/billing/checkout` → 真实支付（Stripe/Paddle/Lemon Squeezy）并回写配额。
- `CORS_ORIGINS` → 仅允许你的扩展 ID。
- 加上限流、日志、监控。
