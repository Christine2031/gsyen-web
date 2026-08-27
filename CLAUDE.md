# GSYEN 项目上下文

## 项目结构
本目录 `C:\Users\Ethan\Desktop\01-Projects\02-own-long-term\01-shared-platforms\GSYEN` 包含以下子项目：
- `gsyen-web/` — 前端 + 内嵌后端（React 19 + Vite 6 + Express），GitHub: Christine3749/gsyen-web
- `gsyen-api/` — 独立后端（Express on GCP Cloud Run，CodexAgent），GitHub: Christine3749/gsyen-api
- `laochen-demo/` — Python ML 预测服务（备货预测 + 顾客流失），本地运行在 http://127.0.0.1:8000
- `gsyen-native/` — 移动端
- `tasks/` — 任务记录

## 代码规范（硬性）
- **单文件 ≤ 300 行**。新建或修改文件时必须遵守；超出就拆分（按职责拆成多个模块/组件/hook）。
- 写代码或评审时，如发现文件已超 300 行，主动提示并给出拆分建议。

## 架构关系
- `gsyen-web` 自带 AI 聊天代理（kimi/deepseek/claude/chatgpt/疆域自托管模型统一路由，走 /api/chat）
- `gsyen-api` 是独立的 CodexAgent 服务（沙盒文件系统 + 搜索工具），CORS 允许 gsyen.com
- `laochen-demo/api.py` 是本地 Python 预测专家服务，被 ChatModule.tsx 在聊天中优先调用

## 当前状态（截至 2026-06-10）

### P0：gsyen.com 邮件体系迁移至阿里云（规划中，2026-08-24）

- `gsyen.com` 是 GSYEN 的核心邮件域和账号体系关键依赖；邮件迁移优先级为 **P0**。
- 目标是将现有 Google / Google Workspace 相关邮件能力逐步迁移到待确认的阿里云邮件产品。
- 当前阶段仅允许盘点、方案设计、只读验证和演练；详细计划见
  [`docs/GSYEN_ALIYUN_MAIL_MIGRATION_P0.md`](docs/GSYEN_ALIYUN_MAIL_MIGRATION_P0.md)。
- **生产冻结规则**：在负责人明确确认阿里云目标产品、切换时间窗口和可执行回滚方案前，禁止修改生产 MX/SPF/DKIM/DMARC/DNS，禁止停用现有邮件服务，禁止执行不可逆操作。
- 仓库现有邮件文档还记录了 Cloudflare Email Routing + Resend 架构；迁移盘点必须先核实现网 Google、Cloudflare、Resend 与 GSYEN Mail Worker 的真实职责和流量边界，不得仅按旧文档推断。

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
  - **Canvas Node 背景规格（勿改回 Cross）**：`StarBackground` 组件，4 向内凹弧星形
    - `arm = 2 * zoom`，`gap = 24 * zoom`，颜色 `#C8C7D6`（bg `#EEEDF6`）
    - SVG arc `A arm,arm 0 0 0`（sweep-flag=0，内凹弧），随 viewport 跟随平移缩放
    - 不使用 ReactFlow `<Background>`，用自定义 `<Panel>` + SVG pattern 实现
  - **光标规格（iA Writer 标准，勿改）**：`width: 2.5px`，`marginLeft: 0`，`borderRadius: 99px`，`height: 1.36em`
    - 原 `marginLeft: -1px` 会在段首（position 0）裁掉 1px → 只剩 1px 可见；必须为 0
    - 宽度 2px 偏细，2.5px 与 iA Writer 视觉一致
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
- `gsyen-web/server.ts` — 多模型路由（kimi/deepseek/claude/chatgpt/疆域自托管模型）
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

## Ethan 的编码习惯问题（2026-06-13 审计，需改进）

### 1. 类型定义顺序：先用后定（循环引用）
`CanvasEditorTypes.ts` 里 `DARK: Palette` 写在 `type Palette` 之前，造成循环引用编译报错。
**习惯**：先写常量，后补类型，容易出现"先用后定义"。
**改法**：类型定义永远放文件顶部，常量/值放后面。

### 2. 新增 CanvasType 值后忘记同步 Record
`CanvasType` 加了 `'nodes'` 分支，但 `canvasHandler.ts` 的 `Record<CanvasType, string>` 没跟着补。
**习惯**：扩展联合类型时只改了声明，没有搜索全局依赖。
**改法**：改联合类型后立即跑 `tsc --noEmit`，让编译器帮你找遗漏。

### 3. 复制粘贴 style 对象产生重复 key
`CanvasStatsPanel.tsx` 同一个 style 对象里出现两次 `borderRadius`、`padding`、`textAlign`。
**习惯**：快速迭代时直接追加属性，没有检查是否已存在同名 key（JS 不报错，TS strict 才报）。
**改法**：修改 inline style 时先找到原始属性再改值，不要追加。

### 4. 组件扩展接口后忘记满足必填参数
`KanbanModule.tsx` 调用 `chatSend` 缺少 `onToken`（必填）。
**习惯**：接口加了必填字段，调用方没同步更新，靠运行时发现而非编译时。
**改法**：接口改动后立即跑 `tsc`，不要等到"跑起来再说"。

### 5. import 遗漏（使用未引入的图标/组件）
`BrandTeam.tsx` 用了 `Shield` 图标但没 import。
**习惯**：快速写 JSX 时先写用法，忘记回头补 import。
**改法**：IDE 自动 import 开起来；没有 IDE 提示时，新用一个符号就立刻加到 import 行。

### 6. setMode 参数类型过窄
`useCanvasMenus.ts` 把 `setMode` 类型声明为 `(m: EditorMode) => void`，
但实际传入的是函数式更新 `m => ...`，两者不兼容。
**习惯**：声明 setter 类型时没有用 `React.Dispatch<React.SetStateAction<T>>`，手写了更窄的版本。
**改法**：来自 `useState` 的 setter 一律用 `Dispatch<SetStateAction<T>>` 类型，不要手写。

### 总结
- **核心问题**：快速开发期间不跑 `tsc`，靠视觉/运行时发现问题，技术债积累到审计时才暴露。
- **铁律**：每次提交前跑一次 `npx tsc --noEmit`，0 错误才 commit。

---

## 缈缈知识库权限规划（未来）
> 当前状态：完全开放，暂不做权限控制。

未来分级：
- **＊ 级用户（优质用户）**：直接拥有知识库注入权限，可修改缈缈的私域知识、品牌信息
- **普通用户**：需提交申请，审核通过后开放
- **实现方式**：Supabase `gsyen_settings` 表 + RLS 权限控制 + 用户等级字段
- **防注入**：system prompt 内置安全规则，拒绝"忽略之前指令"类攻击

---

## GSYEN Designer — 设计系统规范

> 本规范由 Ethan 定义，适用于 GSYEN 全产品线（Web / Electron / Native）的所有 UI 图标与视觉组件。
> 2026-07-12 从根 CLAUDE.md 迁入（做 UI 时随本文件加载）；5 条原则仍保留在根文件。

### Icon 语言
- **笔触**：`strokeWidth=1.5`，`strokeLinecap=round`，`strokeLinejoin=round`（全局统一，无例外）
- **填充**：`fill="none"`（线条风格，不用实心）
- **尺寸单位**：px，viewBox 与渲染尺寸 1:1

### 标准 Icon 规格
| Icon | viewBox | 关键路径 |
|------|---------|---------|
| Sidebar | 16×12 | 外框 rx=1.5，内竖线 x=5.25，无内容线 |
| 窗口 Min | 11×11 | 横线 x1=2 x2=9 y=5.5 |
| 窗口 Max | 11×11 | rect rx=1.5 |
| 窗口 Close | 11×11 | 两条对角线 |
| 预览三角 | 15×17 | `M2 1.5L12.5 7.5Q14 8.5 12.5 9.5L2 15.5Z`（bezier 圆润尖） |
| Chevron ▾ | 8×5 | `M1 1L4 4L7 1`，弹簧旋转动画 |
| DocIcon | 13×13 | rect rx=1.5 + 三条内容线 |
| DrawIcon | 13×13 | 折线 + circle r=1.2 |
| NodeIcon | 13×13 | 三个 rect rx=1 + 虚线连接线 |

### 调色板（GSYEN Writer）
| Token | Light | Dark |
|-------|-------|------|
| bg（写作区） | `#F8F8F8` | `#1A1A1A` |
| chrome（标题/菜单栏） | `#EFEFEF` | `#1A1A1A` |
| fg | `#1A1A1A` | `#CCCCCC` |
| menuFg | `#3D3D3D` | `#999999` |
| accent | `#1A6ECC` | `#4A90D9` |
| 窗口 × hover | `#C42B1C` | `#C42B1C` |

### 调色板（GSYEN App — 7大板块）
| Token | 值 | 用途 |
|-------|---|------|
| chrome | `#F4F2EE` | 工具栏、侧边栏、AppHeader |
| bg | `#F9F8F6` | 主内容区 |
| fg | `#1A1A1A` | 文字、边框 |
| border | `rgba(#1A1A1A, 0.08)` | 工具栏下边框 `border-[#1A1A1A]/8` |

### Toolbar 标准（7大板块统一）
```
relative shrink-0 h-[52px] flex items-center px-8
border-b border-[#1A1A1A]/8 bg-[#F4F2EE]
```
- 所有模块 toolbar 高度 `h-[52px]`，无例外
- 背景必须显式写 `bg-[#F4F2EE]`，不可依赖继承（继承可能拿到白色）

### 文字按钮标准（toolbar 内所有文字 button）
```
px-{N} py-1.5  text-[10px] font-mono font-bold tracking-widest uppercase rounded-none
```
- `py-1.5` 锁定高度，宽度随内容
- 主操作（深底白字）：`bg-[#1A1A1A] text-[#F9F8F6] hover:bg-[#1A1A1A]/80`
- 次要操作（透明底）：`border border-[#1A1A1A]/15 text-[#1A1A1A]/70 hover:bg-[#1A1A1A] hover:text-[#F9F8F6]`
- 危险操作（红色系）：`border border-red-200 text-red-700 hover:bg-red-50`

### Tab 切换器标准（视图/标签 pill 内）
```
px-3.5 py-1.5  text-[10px] font-mono font-bold uppercase tracking-widest rounded-none
```
- 激活态：`bg-[#1A1A1A] text-white`
- 默认态：`text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5`
- 外容器：`flex items-center gap-1 border border-[#1A1A1A]/10 p-1 bg-[#F9F8F6]/40`

### 图标按钮标准（toolbar 内 icon-only button）
```
p-1.5  border border-[#1A1A1A]/15 hover:bg-[#1A1A1A]/5 rounded-none transition-all
```
- icon 尺寸：`w-4 h-4`
- 激活态加：`bg-[#1A1A1A]/10 text-[#1A1A1A]`；默认：`text-[#1A1A1A]/70`
