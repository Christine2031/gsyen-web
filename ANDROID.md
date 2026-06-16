# GSYEN — Android（移动端）开发与对接

> 给接手 Android 线的人（可能是换号后的新环境 / 新 Claude 会话）：
> 这份文档让你冷启动就知道——**连什么后端、当前进度到哪、用什么提示词起步**。
> Android 代码独立放在 `gsyen-native` 仓库；本文档放在 gsyen-web 作为统一索引。
>
> 最后更新：2026-06-16 ｜ Web/桌面端进度：v2.80.131（已进 main）

---

## 0. 先记住一句话：后端独立于 GitHub 账号

换 GitHub / Google 账号**只改"代码放哪"，不碰"服务在哪跑"**。Android 端连的所有后端服务都独立存在：

| 服务 | 地址 | 归属 |
|---|---|---|
| AI 聊天 | `https://gsyen.com/api/chat` | Vercel(gsyen-web) |
| 本地大模型 GSYEN-QW7B | `https://llm.gsyen.com`（Cloudflare Tunnel → Ollama） | 独立 |
| 认证 + 数据 | Supabase | 独立账号 |
| CodexAgent 后端 | gsyen-api（Cloud Run, halfsphere-api） | 独立 GCP |

**三端（Web / Mac / Android）共享同一个大脑 + 同一份用户数据。** Android 只要按下面的契约调这些地址即可——这就是"对接"。

---

## 1. 当前进度快照（Web/桌面端，供 Android 对齐）

- 主线版本：**v2.80.131**（已合并 main）
- 今日完成：注册去重(identities)、登录黄字提示、窗口三键 Sentry 沙箱修复、窗口 max/restore 优雅切换、MAC.md 交接文档
- 认证全流程闭环：注册→验证→tier 升级（细节见 `AUTH.md`）
- 数据库：`auth.users → profiles → 业务表` 全 `ON DELETE CASCADE`
- 七大板块：灵阁(chat)/工作邮件/项目看板/日程日历/复试账簿/军工密钥/PRISM
- 设计哲学：**Chat 是 90%**；iA Writer shell + Google content；卡片即上下文弹药

---

## 2. 核心对接：AI 聊天接口

### POST `https://gsyen.com/api/chat`
**请求体**（JSON）：
```json
{
  "messages": [{ "role": "user", "content": "你好" }],
  "model": "ethan",
  "clientDate": "2026-06-16",
  "events": [],
  "scheduleIntent": null,
  "domain": null
}
```
- `messages`：必填，`{role: 'user'|'assistant'|'model', content}[]`
- `model`：模型 id，见下表。默认 `kimi`
- **响应**：`Content-Type: text/event-stream`（SSE 流式）——Android 用流式读取，逐 token 上屏（打字机效果）

### 模型 id（`model` 字段可选值）
| id | 实际模型 | 走哪 |
|---|---|---|
| `ethan` / `fast` | **GSYEN-QW7B-Instruct**（Qwen2.5 7B） | `OLLAMA_BASE_URL`=llm.gsyen.com |
| `gemini` | Gemini 2.0 Flash | Google API |
| `kimi` / `deepseek` / `claude` / `chatgpt` | 各家云模型 | 各自 API |

> Android v1 默认用 `ethan`(GSYEN-QW7B，自有模型)，聊天界面顶部 chip 可切其他。

---

## 3. 认证对接（两种方式，选一）

1. **Supabase Kotlin SDK 直连**（推荐 Android 原生）：用 `supabase-kt`，邮箱+密码登录，拿 session。RLS 用 `auth.uid()`，业务表按 `user_id` 查。
2. **走 gsyen-api 代理**（和 Web 一致）：`POST /api/auth/login` `/signup` `/me`，refresh_token 进 HttpOnly cookie。详见 `AUTH.md`。

> 移动端通常直连 Supabase SDK 更顺。注意：**signUp 已注册邮箱会返回空 `identities[]`**（防枚举），要据此判"已注册请登录"，别静默放进去（见 AUTH.md §3）。

---

## 4. App 形态：WhatsApp 风格的聊天优先工作台

- 主屏 = WhatsApp 式会话列表，置顶主角是 AI 助手「缈缈」
- 聊天界面 = WhatsApp 气泡 + 流式 AI + 模型切换 chip
- 底部 3 tab：对话 / 工作台(七大板块) / 我的
- 技术栈：Kotlin + Jetpack Compose + Material 3，深色模式
- 调色板：bg `#F9F8F6`、chrome `#F4F2EE`、fg `#1A1A1A`、单一强调色 `#1A6ECC`

### 卡片即上下文（泡泡哲学）
与某张卡片（订单/日程/联系人）对话时，聊天顶部冒出一个 **36px 黑色圆泡**（`#1A1A1A`）代表"当前以此卡为上下文"，点泡可切换/退出该上下文。这是 GSYEN 的核心交互，Android 要原生实现。

---

## 5. Google AI Studio 提示词

### 第一轮（生成骨架）—— 见对话记录，要点：
会话列表 + AI 聊天气泡（流式 mock）两屏跑通，再搭工作台 tab。完整提示词 Ethan 已有，核心是上面 §4 的形态描述。

### 第二轮（把缈缈对话 + 卡片弹泡做精）—— 骨架出来后贴这段：
```
在现有 GSYEN Android 骨架上，把 AI 聊天界面打磨到生产级：

1. 真·流式对话（替换 mock）：
   - 接 POST https://gsyen.com/api/chat，Content-Type 发 application/json，
     body: { messages: [...], model: "ethan", clientDate: "今天" }
   - 响应是 text/event-stream（SSE），逐 token 追加到当前 AI 气泡，打字机效果
   - 发送时先插入一个空 AI 气泡 + 「正在输入…」三点动画，收到首 token 后开始填充
   - AI 气泡渲染 Markdown（加粗/列表/代码块高亮）；用户气泡纯文本右对齐
   - 顶部模型 chip 可切 ethan / gemini / claude / kimi，切换即改 body.model

2. 卡片上下文弹泡（GSYEN 核心交互）：
   - 从工作台点某张卡片（订单/日程/联系人）发起对话时，
     聊天界面顶部出现一个 36px 黑色圆泡（#1A1A1A，白色图标），
     表示「当前以此卡为上下文」
   - 弹泡用弹簧动画淡入；点击弹泡可展开卡片摘要 / 退出该上下文
   - 该上下文下发送消息时，body 里带上 domain 字段（如 "order"/"schedule"）

3. 细节：
   - 消息持久化到 Room，重进会话能恢复
   - 下拉到顶加载更早消息
   - 长按消息：复制 / 引用
   - 调色板严格用：bg #F9F8F6 / 气泡用户 #1A6ECC 白字 / 气泡 AI #F4F2EE 黑字
   - 深色模式：bg #1A1A1A / AI 气泡 #2A2A2A

先把 1（真流式）跑通，再做 2（卡片弹泡），最后 3（细节）。
```

---

## 6. 换账号 / 新仓库清单（Android 专属）

1. **新建 `gsyen-native` 仓库**（新账号下），把 ANDROID.md 复制过去作为该仓库的 README/索引
2. **后端地址不用改**：`gsyen.com/api/chat`、`llm.gsyen.com`、Supabase URL/anon key 直接用（独立于账号）
3. Supabase anon key、各模型 API key → Android 用 `local.properties` / BuildConfig 注入，**别硬编码进 git**
4. 与 Web/Mac 的协同：三端共享后端，改后端契约要三端同步通知（本文档 §2/§3 是契约源头）

---

## 7. 上手顺序建议

1. AI Studio 第一轮提示词 → 出骨架（会话列表 + 聊天两屏）
2. 第二轮提示词 → 接真流式 `/api/chat` + 卡片弹泡
3. 接 Supabase 登录（邮箱+密码，注意已注册邮箱判断）
4. 工作台 tab 逐个板块接 Supabase 数据
5. 打包测试 → 上架准备（签名、Play Console）
