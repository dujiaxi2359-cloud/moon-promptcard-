# Moon PromptCard

一个浏览器悬浮式**提示词分析与优化**插件。在任意网页的输入框里写提示词时，点击悬浮按钮即可对当前提示词进行评分、问题诊断、优化建议，并支持一键复制或替换原输入框内容。

- 技术栈：Chrome Extension Manifest V3 + React + TypeScript + Vite + Tailwind CSS
- 两种服务模式：**内置服务（Mock，待接真实后端）** 与 **自定义 OpenAI 兼容 API**
- UI 风格：黑橙科技感 + 轻玻璃拟态，深浅网页均清晰可读

---

## 功能一览

- **Popup 主弹窗**：账号 / 版本、历史 / 刷新 / 设置入口，内置服务与自定义 API 切换。
- **自定义 API**：填写 Base URL / API Key / 模型，一键「测试本地 API」，配置仅存本地。
- **内置服务（Mock）**：展示剩余次数、最佳分析结果、购买入口（打开外部支付页占位）。
- **悬浮分析条**：注入到网页左侧的玻璃胶囊，开关监听、读取输入框 / 选中文本、一键分析。
- **分析结果卡片**：玻璃拟态、可拖拽、可收起成小胶囊，含评分环、问题诊断、优化建议、优化后提示词、负面限制。
- **结果操作**：复制 / 替换原文 / 重新生成 / 收起 / 关闭。
- **设置页**：界面与提示词语言（中 / English）、主题、悬浮球开关、默认模型、退出登录。
- **持久化**：登录状态、服务模式、API 配置、最近一次分析结果均存于 `chrome.storage.local`。

---

## 目录结构

```
moon-promptcard/
├─ public/
│  ├─ manifest.json            # MV3 清单
│  └─ icons/                   # 16/32/48/128 图标
├─ popup.html / options.html   # 两个页面入口
├─ src/
│  ├─ background/service-worker.ts   # 消息路由 / 上下文菜单
│  ├─ content/
│  │  ├─ content-script.tsx          # Shadow DOM 挂载
│  │  ├─ FloatingApp.tsx             # 悬浮条 + 结果卡片
│  │  └─ editable.ts                 # 读取/替换输入框与选区
│  ├─ popup/Popup.tsx
│  ├─ options/Options.tsx
│  ├─ components/                    # ResultBody / ui / icons
│  ├─ lib/
│  │  ├─ api.ts                      # 自定义 API + 内置服务 Mock
│  │  ├─ storage.ts                  # chrome.storage 封装
│  │  ├─ promptAnalyzer.ts           # 分析规则 + 本地启发式兜底
│  │  ├─ i18n.ts / types.ts
│  └─ styles/global.css
├─ vite.config.ts              # 主构建（popup/options/service-worker）
└─ vite.content.config.ts      # 内容脚本独立 IIFE 构建
```

> 内容脚本不能是 ES module，因此单独用一份 Vite 配置打成自包含的 IIFE 包，写入同一个 `dist/`。

---

## 安装与运行

```bash
npm install      # 安装依赖（仅首次）
npm run watch    # 开发推荐：同时监听 popup/options/SW 与 content-script，自动重建 dist/
npm run dev      # 仅监听 popup/options/SW（不含悬浮条 content-script）
npm run build    # 生产构建，产物在 dist/
npm run typecheck
```

> `dev` 不会重建 content-script（悬浮条），改悬浮条相关代码请用 `npm run watch`。
> 完整的本地预览与调试流程见 [开发预览指南.md](./开发预览指南.md)。

### 加载到 Chrome

1. 运行 `npm run build`，得到 `dist/` 文件夹。
2. 打开 `chrome://extensions`，右上角开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择 `dist/` 文件夹。
4. 固定插件图标，点击即可打开 Popup。

开发时 `npm run watch` 会持续把改动写入 `dist/`；改动后在扩展页点击插件卡片上的「刷新」（↻）即可看到更新。改 Popup/Options 重开弹窗即可；改 service worker 点刷新；改 content script（悬浮条）点刷新并重新加载测试网页。详见 [开发预览指南.md](./开发预览指南.md)。

---

## 接入真实后端

打开 `src/lib/api.ts`：

- 把 `BUILTIN_API_BASE_URL` 设为你的后端地址。
- 把 `USE_MOCK_BUILTIN` 改为 `false`。

后端需实现：`GET /api/me`、`GET /api/quota`、`POST /api/analyze`、`POST /api/auth/login`、`POST /api/auth/logout`、`POST /api/billing/checkout`。官方模型 Key 只放在后端，**绝不写入插件前端**。

---

## 隐私与安全

- 自定义 API Key 仅存于本地 `chrome.storage.local`，不上传到我们的服务器。
- 仅在用户**主动点击分析**时才读取输入框或选中文本，不自动采集整页内容。
- 不加载远程代码、不使用 `eval`、不混淆代码。

详见 `PRIVACY.md` 与 `CHROMEWEBSTORE.md`。
