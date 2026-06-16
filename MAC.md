# GSYEN — Mac (macOS) 交接文档

> 给接手 Mac 线的同事:这份文档把项目里**所有 Mac 专属的代码点**都标了 `文件:行号`，
> 照着读一遍就能完整掌握 Mac 端。Windows 与 Web 已由 Ethan + Claude 维护，你专注 macOS。
>
> 最后更新：2026-06-16 ｜ 当前版本 v2.80.131

---

## 0. 项目全景（先搞清楚你在改什么）

| 子项目 | 是什么 | 仓库 |
|---|---|---|
| **gsyen-web** | 前端(React 19+Vite 6) + 内嵌 Express + **Electron 桌面端**(Win/Mac) | Christine2031/gsyen-web |
| gsyen-api | 独立后端(Cloud Run) | Christine2031/gsyen-api |
| gsyen-native | 移动端(未来 Android/iOS) | — |

**Mac 客户端 = `gsyen-web` 里的 Electron 部分**，和 Windows 共用同一套 React 代码，只在少数地方按平台分叉。你要改的就是这些分叉点。

入口文件：
- `electron/main.cjs` — 主进程(窗口、生命周期、托盘、IPC)
- `electron/preload.cjs` — 沙箱桥(暴露 `window.electronAPI`)
- React 层按 `electronAPI.platform === 'darwin'` 判断 Mac

---

## 1. ⚠️ 最重要：代码签名 + 公证（当前最大缺口）

**现状：Mac 的 `.dmg` 没有签名、没有公证。** `package.json` 的 `build.mac` 里没有 `identity`、没有 `afterSign`/notarize、没有 entitlements。

后果：
1. 用户下载后 macOS **Gatekeeper 会拦**（"GSYEN 已损坏，无法打开" 或 "无法验证开发者"），必须右键→打开，或 `xattr -cr /Applications/GSYEN.app`。
2. **electron-updater 在 Mac 上无法自动更新**——Mac 的自动更新**强制要求 App 已签名**。这就是 Sentry 里 `updater:check` / `ZIP file not provided` 那批报错的根源：Mac 端自动更新链路是断的，现在只能手动下载 DMG 重装（见 §5）。

**你的头号任务**：申请 Apple Developer ID，配置签名 + 公证：
- `build.mac.identity` + entitlements(`hardened runtime`)
- electron-builder 的 `afterSign` 跑 `electron-notarize`（或 `notarytool`）
- CI 里注入 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `CSC_LINK`(.p12) / `CSC_KEY_PASSWORD` 等 secrets

签名+公证做好后，Gatekeeper 放行 + 自动更新才能通。

---

## 2. 窗口框架（Mac 用原生交通灯，别自绘）

`electron/main.cjs:200-201`：
```js
titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 10 } : undefined,
```
- Mac：`hiddenInset` → 隐藏标题栏但**保留系统原生红黄绿灯**(左上)，位置 `(14,10)`
- Windows：`hidden` → 完全无原生栏，自绘三键

**铁律：Mac 的 min/max/close 一律交给系统绿灯，不要自绘窗口键。** Windows 才自绘。

### 为交通灯留出的左侧空间（Mac 专属 padding）
- `AppHeader.tsx:141`：`isMac ? 'pl-20 pr-8' : 'px-8'` — 主页顶栏左侧留 80px 给绿灯
- `CanvasChrome.tsx:52`：`paddingLeft: isMac ? 70 : 0` — Writer 标题栏左侧留 70px 给绿灯

> 调绿灯位置时，这两个 padding 要跟着 `trafficLightPosition` 一起调，否则 logo/侧栏图标会被绿灯压住。

---

## 3. 窗口控件逻辑（两层、两套）

| 层 | Windows | Mac |
|---|---|---|
| **主页 Chat**(AppHeader) | 自绘三键 `AppHeader.tsx:193`(`platform==='win32'`) | **不渲染**，用原生绿灯 |
| **Writer 文档**(CanvasChrome) | 自绘 min/max/close | min/max **不渲染**(`!isMac`，`CanvasChrome.tsx:109-110`)，用绿灯 |
| **Writer 的 × (返回 Chat)** | 自绘 | **保留**(无 `!isMac` 守卫) |

**关键**：Writer 的 × 不是"关窗"，是"**返回 Chat**"(`onClose`)。Mac 的绿灯红点只能关窗、做不到返回，所以 Writer 在 Mac 上**同时有**左上绿灯(关窗/最小化) + 右上自定义 ×(返回 Chat)。两者不冲突，是有意设计。

> 2026-06-16 新增的 max/restore 图标切换(`useIsMaximized` hook + `RestoreIcon`)是 **Windows 专属**——Mac 没有自绘 max 按钮，此功能在 Mac 上天然 N/A，相关代码已用 `!isMac`/`win32` 守好，**对 Mac 零影响**。

`isMac` 判断的三处定义（都一样）：
- `AppHeader.tsx:125`、`CanvasEditorTypes.ts:73`、`UpdateToast.tsx:31` → `electronAPI?.platform === 'darwin'`

---

## 4. 生命周期（Mac 惯例：关窗不退出）

`electron/main.cjs`：
- **`:240` Mac 原生全屏动画**：监听 `enter/leave-full-screen`，发 `fullscreen:change` 事件给渲染层做淡入。Windows 走 F11 自绘全屏，Mac 走系统全屏——**两套动画，别混**。
- **`:271` `app.on('activate')`**：Mac 点 Dock 图标时若无窗口则重建(macOS 惯例)。
- **`:286` `window-all-closed`**：Mac 下 `!forceQuit` 时**不退出**(关窗只是隐藏，App 仍在 Dock/托盘)，只有托盘菜单 Quit(`forceQuit`)才真退出。这是 macOS 标准行为，别改成 Windows 那种关窗即退。

---

## 5. 自动更新（Mac 当前是「手动重装」）

Mac 与 Windows 的更新体验**故意不同**，因为 Mac 自动更新需签名(见 §1)：

- `ChatUpdaterCard.tsx:19-24`：`isMac` → phase 直接 `'ready'`，**不后台下载**(Mac 不走 electron-updater 静默下载)
- `UpdateToast.tsx:142`：
  - Mac：「新版本已发布，**下载 DMG 重新安装**即可」
  - Win：「已在后台下载完成，**重启后生效**」

**做完签名+公证后**，可以把 Mac 也切到 electron-updater 真·自动更新，届时改这两处文案 + 逻辑。

---

## 6. 构建与发布

### build 配置（`package.json` → `build.mac`）
```json
"mac": {
  "target": [{ "target": "dmg", "arch": ["arm64", "x64"] }],
  "icon": "public/icon-512.png",
  "artifactName": "GSYEN-Setup-Mac-${arch}.dmg",
  "category": "public.app-category.productivity"
}
```
- 双架构：**arm64(M1/M2/M3)** + **x64(Intel)**，各出一个 DMG
- 命名：`GSYEN-Setup-Mac-arm64.dmg` / `GSYEN-Setup-Mac-x64.dmg`

### CI（`.github/workflows/release.yml`）
- `build-mac` job 跑在 **`macos-latest`**(`:64`)
- 产物：两个 `.dmg` + `latest-mac.yml`(electron-updater 清单) 传 GitHub Release(`:87-88`)
- 同时上传到 **Cloudflare R2**(`:99-100`，落地页下载用)
- 触发方式：push `v*` tag(和 Windows 同一条 workflow，tag 一推两端同时构建)

### 发布流程（和 Windows 一样，Ethan 的脚本）
```bash
npm run version:feat     # 功能点++
npm run version:release  # commit + tag + push → CI 自动出 .exe + .dmg
```

---

## 7. 本地开发（在 Mac 上跑）

```bash
npm install
npm run electron:dev     # vite(5173) + electron 一起起
```
- 已修正端口：`electron:dev` 等 `127.0.0.1:5173`(2026-06-16 修)
- `isDev = !app.isPackaged`，dev 自动加载 `127.0.0.1:5173`，无需设 NODE_ENV
- Mac 上 `titleBarStyle: hiddenInset` 会直接显示原生绿灯，方便对照

---

## 8. 跨平台的坑（Mac 也中招，非 Mac 专属但要知道）

- **preload 沙箱不能 require npm 包**(2026-06-16 血泪)：之前 `require('@sentry/electron/preload')` 让整个 `electronAPI` 在 Mac 上也废了(canvas/v2ray/updater 全挂，只是不像 Windows 那样"三键消失"明显)。已修。**以后往 preload 加任何第三方包前，先想沙箱。**
- **Writer 老 bug(跨平台)**：节点文档 JSON 串味、文档 `type` 字段丢失 → 显示成 `{"nodes":[],"edges":[]}` 原文。Mac 也有，待修。
- **v2ray**：`electron/v2ray.cjs:15` 按平台选二进制(`win32` 加 `.exe`)，Mac 用无扩展名版——确认 `electron/v2ray-core/` 里有 Mac(darwin)的核心二进制。

---

## 9. Mac 接手关键词清单（快速索引）

| 关键词 | 位置 |
|---|---|
| 平台判断 | `electronAPI.platform === 'darwin'` / `isMac` |
| 原生交通灯 | `titleBarStyle: hiddenInset` + `trafficLightPosition` `main.cjs:200-201` |
| 绿灯留白 | `pl-20`(AppHeader:141) / `paddingLeft:70`(CanvasChrome:52) |
| 自绘键守卫 | `!isMac`(CanvasChrome:109-110)、`platform==='win32'`(AppHeader:193) |
| Writer × = 返回 | CanvasChrome close 按钮(无 `!isMac`) |
| 原生全屏动画 | `main.cjs:240` `enter/leave-full-screen` → `fullscreen:change` |
| 关窗不退出 | `main.cjs:286` `window-all-closed` + `forceQuit` |
| Dock 激活重建 | `main.cjs:271` `app.on('activate')` |
| 更新=手动重装 | `ChatUpdaterCard.tsx:19`、`UpdateToast.tsx:142` |
| 构建 DMG 双架构 | `package.json build.mac` |
| CI 构建 | `release.yml` `build-mac` on `macos-latest` |
| **签名+公证(待做)** | **§1，头号任务** |

---

## 10. 给你的上手顺序建议

1. 先 `npm run electron:dev` 在 Mac 上把项目跑起来，对照本文档逐个 Mac 分叉点看一遍。
2. 装一次正式 DMG，亲历 Gatekeeper 拦截 + 手动更新的痛 → 理解 §1 为什么是头号任务。
3. 优先攻 **签名 + 公证**(§1) → 这一步通了，Mac 的 Gatekeeper 和自动更新两个老大难一起解决。
4. 再处理 Mac 体验细节(绿灯位置、全屏动画手感)。
5. 跨平台 bug(§8)和 Ethan/Claude 协同修，别和 Windows 线打架。
