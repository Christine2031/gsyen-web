# GSYEN 项目上下文

## 项目结构
本目录 `C:\Users\Ethan\Desktop\01-Projects\GSYEN` 包含以下子项目：
- `gsyen-web/` — 前端 + 内嵌后端（React 19 + Vite 6 + Express），GitHub: Christine2031/gsyen-web
- `gsyen-api/` — 独立后端（Express on GCP Cloud Run，CodexAgent），GitHub: Christine2031/gsyen-api
- `laochen-demo/` — Python ML 预测服务（备货预测 + 顾客流失），本地运行在 http://127.0.0.1:8000
- `gsyen-native/` — 移动端
- `tasks/` — 任务记录

## 代码规范（硬性）
- **单文件 ≤ 300 行**。新建或修改文件时必须遵守；超出就拆分（按职责拆成多个模块/组件/hook）。
- 写代码或评审时，如发现文件已超 300 行，主动提示并给出拆分建议。

## 架构关系
- `gsyen-web` 自带 AI 聊天代理（kimi/deepseek/claude/chatgpt/gemini 统一路由，走 /api/chat）
- `gsyen-api` 是独立的 CodexAgent 服务（沙盒文件系统 + Gemini + Tavily），CORS 允许 gsyen.com
- `laochen-demo/api.py` 是本地 Python 预测专家服务，被 ChatModule.tsx 在聊天中优先调用

## 当前状态（截至 2026-06-10）

### 已完成
- gsyen-api 补充了 `package-lock.json`（之前缺失）
- gsyen-web 和 gsyen-api 都添加了 `.nvmrc`（Node 22 LTS）
- **GSYEN-QW7B-Instruct 上线**：gsyen-ethan（实际架构 Qwen2.5 7B Instruct，Q8_0；命名沿用旧称 deepseek-ethan/GSYEN-DP8B 系误标，已于 2026-06-08 用 `ollama show` 核实并更正）通过 Cloudflare Tunnel 接入 gsyen.com
  - 隧道地址：`https://llm.gsyen.com` → christine-pro:11434
  - Vercel 环境变量 `OLLAMA_BASE_URL=https://llm.gsyen.com` 已配置
  - 聊天界面 GSYEN-QW7B-Instruct 排第一、默认选中
  - Cloudflare Tunnel 已注册为 Windows 服务（开机自启）
  - Ollama 已注册为计划任务（登录自启）
- ChatModule.tsx 加入"调度员"逻辑（本地预测专家优先，未联调，未提交）
- **CANVAS 编辑器完成并提交（2026-06-10，commit 075f931）**：iA Writer 精确复刻，关键文件：
  - `src/components/CanvasEditorContent.tsx` — 全屏编辑器主体（portal），三面板常驻 DOM display 切换（消除模式切换卡顿）
  - `src/components/CanvasEditorTypes.ts` — **iA Writer 调色板锁定**（勿随意改动）
    - DARK: bg/chrome=`#1A1A1A`，fg=`#CCCCCC`，accent=`#4A90D9`
    - LIGHT: bg=`#F8F8F8`，chrome=`#EFEFEF`，fg=`#1A1A1A`，accent=`#1A6ECC`
    - 原则：chrome=bg（无色带），R=G=B（无暖色），单一蓝 accent
  - `src/components/CanvasChrome.tsx` — iA Writer 风格标题栏 + 菜单栏
  - `src/components/CanvasStatsPill.tsx` — 三层深度悬浮 pill（hidden→visible→hover→active）
  - `src/components/CanvasStatsPanel.tsx` — 镂空卷帘面板（backdropFilter blur 20px，弹簧动画）
  - `src/hooks/useCanvasTheme.ts` — CodeMirror 主题 + focusModeExt + typewriterExt
  - `src/stores/canvasStore.ts` — 文档存储
  - `src/domains/canvasHandler.ts` — 神机百炼 CANVAS handler
  - `src/components/CanvasNodeCard.tsx` — 四向连接 handle，双击编辑
  - `src/components/CanvasNodeEditor.tsx` — React Flow Node Canvas
  - 默认 Light mode；Stats pill 与 panel 间距 ~13px
- **Electron Windows 客户端 v1.0.7（2026-06-10）**：
  - `app.isPackaged` 替代 `NODE_ENV` 检测开发/生产（`NODE_ENV` 打包后是 undefined，会导致白屏）
  - `electron-updater` 必须在 `dependencies`（不是 devDependencies），否则打包后找不到模块
  - `vite.config.ts` 必须加 `host: '127.0.0.1'`：Node 17+ localhost 优先解析 IPv6(::1)，Electron loadURL 连的是 IPv4(127.0.0.1)，不加会 ERR_CONNECTION_REFUSED 白屏
  - `vite.config.ts` 必须加 `base: './'`：Vite 默认 base='/' 生成绝对路径资源，file:// 协议下 /assets/... 解析为文件系统根目录导致 404 白屏（这是所有版本白屏的根本原因，v1.0.11修复）
  - `dist-electron/` 已加入 `.gitignore`，禁止 commit 构建产物（electron.exe 220MB 超 GitHub 限制）
  - 自动更新：`electron-updater` + ChatSidebar 底部状态卡（Figma风格，静默下载，ready后显示）
  - 系统托盘：`Tray` + `extraResources/icon.ico`（Windows Tray 只认 ICO，PNG 会崩溃）
  - Release 命名：`GSYEN-Setup-${version}.exe`（参考 Claude: Claude-Setup-x.x.x.exe）

### 下一步：迁移到 M1 做永久服务器
- 在 M1 上安装 Ollama，拉取 gsyen-ethan（GSYEN-QW7B-Instruct，Qwen2.5 7B Instruct）模型
- 在 M1 上安装 cloudflared，重建隧道指向 M1
- 更新 Vercel 的 OLLAMA_BASE_URL
- christine-pro 的隧道和自启可以关掉

### 版本对齐状态
- 共享依赖版本基本一致（仅 supabase 有 ^2.106.1 vs ^2.106.2 微小差异，无影响）
- gsyen-api 只有 1 个 commit（2026-05-25），gsyen-web 活跃更新中

## 关键文件
- `gsyen-web/server.ts` — 多模型路由（kimi/deepseek/claude/chatgpt/gemini）
- `gsyen-web/api/chat.ts` — Vercel serverless 版本（逻辑与 server.ts 完全相同，存在重复代码）
- `gsyen-web/src/components/ChatModule.tsx` — 聊天 UI，含待提交的本地预测路由
- `gsyen-api/server.ts` — CodexAgent 后端（~40KB，含沙盒工具）
- `laochen-demo/api.py` — Python 预测 API，端口 8000

## Ethan 的话
> 心中有梦想，天下又何妨？
> —— 2026-06-06

## 下一步工作
1. 联调 laochen-demo /ask 接口，确认 ChatModule.tsx 的路由逻辑正常
2. 联调通过后提交 ChatModule.tsx
3. 会员系统（下一个大模块）
4. 考虑合并 server.ts 和 api/chat.ts 的重复 SYSTEM_PROMPT 和 MODEL_ROUTES

## 缈缈知识库权限规划（未来）
> 当前状态：完全开放，暂不做权限控制。

未来分级：
- **＊ 级用户（优质用户）**：直接拥有知识库注入权限，可修改缈缈的私域知识、品牌信息
- **普通用户**：需提交申请，审核通过后开放
- **实现方式**：Supabase `gsyen_settings` 表 + RLS 权限控制 + 用户等级字段
- **防注入**：system prompt 内置安全规则，拒绝"忽略之前指令"类攻击
