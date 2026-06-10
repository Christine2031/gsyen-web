<div align="center">

<br />

```
疆域  GSYEN
```

**全功能智能工作套件**

*AI 聊天 · 项目看板 · 日程日历 · 财务账簿 · 密钥库 · 品牌实验室*

<br />

[![Windows](https://img.shields.io/badge/Windows-下载-0078D4?style=flat&logo=windows&logoColor=white)](https://gsyen-releases.oss-cn-shenzhen.aliyuncs.com/GSYEN-Setup-Windows.exe)
[![macOS](https://img.shields.io/badge/macOS-Beta-999999?style=flat&logo=apple&logoColor=white)](https://gsyen-releases.oss-cn-shenzhen.aliyuncs.com/GSYEN-Setup-Mac.dmg)
[![Web](https://img.shields.io/badge/Web-gsyen.com-1A1A1A?style=flat)](https://gsyen.com)
[![License](https://img.shields.io/badge/License-Private-red?style=flat)](.)

[![YouTube](https://img.shields.io/badge/YouTube-@iSgsyenTt-FF0000?style=flat&logo=youtube&logoColor=white)](https://www.youtube.com/@iSgsyenTt)
[![Discord](https://img.shields.io/badge/Discord-加入服务器-5865F2?style=flat&logo=discord&logoColor=white)](https://discord.gg/338tsy2Dup)

</div>

---

## 产品

GSYEN 是由**雍彻科技**开发的本地优先全功能工作套件，支持 Web / Windows / macOS 三端同步。

| 模块 | 说明 |
|------|------|
| 疆域灵阁 | 多模型 AI 聊天（GSYEN-QW7B · Kimi · DeepSeek · Claude · GPT） |
| 项目看板 | Trello 风格四列看板 + 拖拽 |
| 日程日历 | 格网月历 · 执行周历 · 单日重点 |
| 复式财务 | 双重记账账簿 |
| 军事级密钥库 | 本地加密密码管理 |
| CANVAS 编辑器 | iA Writer 精确复刻，支持写作 / 预览 / 分栏 / 节点图 |

## 下载

| 平台 | 链接 | 状态 |
|------|------|------|
| Windows x64 | [GSYEN-Setup-Windows.exe](https://gsyen-releases.oss-cn-shenzhen.aliyuncs.com/GSYEN-Setup-Windows.exe) | 稳定版 |
| macOS (Apple Silicon / Intel) | [GSYEN-Setup-Mac.dmg](https://gsyen-releases.oss-cn-shenzhen.aliyuncs.com/GSYEN-Setup-Mac.dmg) | Beta |
| Web | [gsyen.com](https://gsyen.com) | 稳定版 |

> macOS 首次打开：右键 → 打开 → 仍然打开（绕过 Gatekeeper）

## 本地开发

```bash
# 克隆
git clone https://github.com/Christine2031/gsyen-web.git
cd gsyen-web

# 安装依赖
npm install

# Web 开发服务器
npm run dev

# Electron 开发模式
npm run electron:dev
```

**环境变量**（`.env.local`）

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
KIMI_API_KEY=
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

## 技术栈

```
前端      React 19 · TypeScript · Vite 6 · Tailwind CSS 4
编辑器    CodeMirror 6 · iA Writer Mono/Quattro
节点图    React Flow (@xyflow/react)
桌面端    Electron 42 · electron-builder 26
后端      Express · Vercel Serverless
数据库    Supabase (PostgreSQL)
AI        Kimi · DeepSeek · Claude · GPT · Gemini · Qwen2.5 (本地)
监控      Sentry
分发      阿里云 OSS · GitHub Releases
```

## 自动发布

推送 tag 即触发 Windows + macOS 双平台自动构建并发布：

```bash
npm version patch
git push origin main --follow-tags
```

---

<div align="center">

© 2026 **雍彻科技** · GSYEN · All rights reserved.

</div>
