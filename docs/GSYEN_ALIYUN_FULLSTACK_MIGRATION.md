# GSYEN 全栈迁移阿里云：业务与技术蓝图

状态：代码盘点与非生产设计阶段  
日期：2026-08-24  
原则：保留 GSYEN 业务逻辑；不购买阿里企业邮箱；未批准前不改生产 DNS/MX

> **2026-08-26 勘误与优先级说明**：本文是早期蓝图，不能直接作为执行清单。当前用户批准的
> 第一阶段邮件架构固定为 `Cloudflare Email Routing -> Worker -> D1/R2 主记录 -> Queue ->
> 阿里云 mail-ingest -> Stalwart`，根域 MX 不变，Resend 是唯一生产外发通道；本文后文关于
> 首期把邮件主记录迁到 RDS/OSS/SMQ 或直接改为阿里云 SMTP ingress 的内容已被取代。
> 另外，一台 ECS 同时最多绑定一个实例 RAM role，当前独立权限要求下 HalfSphere 推荐使用
> 独立 ECS。执行证据以 `docs/migration/` 下 2026-08-26 文档为准。

## 1. 当前理解边界

本文件基于当前工作区六个 Git 仓库、部署配置、环境变量、邮件数据库迁移和公开 DNS
的只读检查。它已经覆盖主要部署单元与邮箱核心链路，但在取得生产控制台只读数据、
Supabase schema/容量、Cloudflare D1/R2/Queue 统计和 Google 历史数据清单前，不能声称
已经掌握所有生产数据与隐藏配置。

## 2. 业务单元与现状

| 单元 | 主要职责 | 当前运行依赖 | 阿里云目标 |
| --- | --- | --- | --- |
| 根仓库 `gsyen` | Web、Electron、聊天、Canvas、日程、Finance、Vault、Mail UI | Vercel、外部模型 API、Supabase、R2 发布源 | Web 静态资源用 OSS+CDN/ESA；Node API 用 SAE；桌面客户端只改服务端端点 |
| `gsyen-api` | Auth 代理、注册、邮箱自动开通、业务 CRUD、Agent/Chat、workspace | Google Cloud Run、Supabase、Turnstile、模型 API | ACR+SAE；保持 HTTP API 和 Cookie 语义 |
| `email-worker` | 自研邮箱领域与 API、入站解析、出站队列、DLQ、审计 | Cloudflare Worker、Email Routing、D1、R2、Queues、Resend | 邮件 API/消费者用 SAE/FC；RDS PostgreSQL、OSS、SMQ；自研 SMTP 入站 |
| `sgsyen-api` | 研究报告鉴权、元数据、正文和签名下载 | Cloud Run、Supabase、GCS | SAE、RDS/Supabase 过渡、OSS |
| `sgsyen-web` | 研究站 Web 与会员登录 | Vercel、Supabase | OSS+CDN/ESA；保持 Auth 契约 |
| `gsyen-model` | 备货和客户流失预测 FastAPI | 本地 Python/CSV | 非生产先用 SAE/ECS；需要 GPU 后再评估 PAI/EAS |
| `gsyen-android` | Android 客户端 | 远程 API、Room 本地库 | 不搬运行时；仅通过配置切换 API 域名 |

仍需保留或另行决策的外部能力：Supabase Auth/Realtime/API、Moonshot、DeepSeek、
Gemini、OpenAI、Tavily、Resend、Sentry、GitHub Actions、Cloudflare DNS/Turnstile。
“迁到阿里云”不应被误解为一次性重写这些业务协议。

## 3. GSYEN 自研邮箱的真实业务链路

### 3.1 身份与邮箱生命周期

1. `gsyen-api` 通过 Supabase 创建或验证用户；
2. 注册成功后使用内部令牌调用 `/v1/internal/mailboxes/register`；
3. `owner_id` 与 Supabase user id 一对一绑定；`mailbox_addresses` 保存主地址与别名；
4. 注册失败时回滚用户和邮箱，停用账号时先撤销邮箱；
5. 用户 API 继续使用 Supabase Bearer Token，管理员由 `app_metadata.mail_admin` 判断。

迁移硬约束：`owner_id`、邮箱地址、别名、状态与 API 响应不能因为更换云平台而改变。

### 3.2 入站

当前链路为 `gsyen.com MX -> Cloudflare Email Routing -> Worker email handler`。Worker：

- 校验域名、大小、收件地址和邮箱状态；
- 用 PostalMime 解析 MIME，限制头大小、嵌套深度和附件数；
- 旧实现按 RFC `Message-ID` 优先查重；2026-08-26 审计证明相同 Message-ID、不同 raw hash
  会被静默丢弃，定为 P0，必须改为基于原始 envelope recipient + raw hash 的 delivery
  fingerprint 后才允许生产镜像；
- 把原始 EML、隔离 HTML、附件写入 R2；
- 把索引、正文和状态原子写入 D1。

阿里云目标不能只部署 HTTP 服务，因为公网邮件入站使用 SMTP/TCP 25。目标入口应为
独立的 SMTP ingress（优先评估 Stalwart 或 Postfix+受控转发适配器）部署在经阿里云
书面许可的 ECS/ACK 环境，使用固定 EIP、正确 PTR、TLS、反垃圾与病毒扫描，再将原始
MIME 交给 GSYEN 入站应用。阿里云官方说明 ECS 的 TCP 25 默认受限，因此在许可、
端口、PTR 和投递演练完成前，Cloudflare Email Routing 必须保留为生产入口。

### 3.3 出站

当前 API 先创建 `queued` 邮件和发送用量记录，再向队列投递 message id；消费者以条件
更新认领邮件，调用 Resend，保存 provider id / RFC Message-ID，并通过 reconciliation、
重试、DLQ、terminal queue 和定时巡检处理不确定结果。

迁移硬约束：保留幂等键、发送配额、状态机、延迟重试、死信、受控重放、投递回执和
审计。首期建议继续 Resend，仅新增 `MailProvider` 适配器；阿里云邮件推送通过测试后
再作为第二 provider。不要让 ECS 直接向互联网 TCP 25 投递。

### 3.4 邮件数据与客户端 API

当前模型包括邮箱、主地址/别名、消息、附件、每日用量、审计、对象删除任务、死信、
运维事故和增量同步事件。客户端支持 inbox/sent/outbox/starred/snoozed/archive/drafts/
spam/trash、游标分页、消息状态批量更新、附件下载、HTML 安全预览和增量同步。

阿里云数据库迁移必须保留 UUID、唯一约束、去重索引、状态条件更新和同步序列语义。

## 4. 目标架构

```text
互联网邮件
   │ SMTP 25（只在许可、固定 IP、PTR、TLS 和演练完成后）
   ▼
阿里云 SMTP Ingress（双可用区 ECS/ACK）
   │ 原始 MIME + envelope 元数据
   ▼
GSYEN Mail API / Inbound / Outbound Consumer（ACR + SAE，必要任务用 FC）
   ├── RDS PostgreSQL：邮箱、消息索引、状态、配额、审计、DLQ 元数据
   ├── OSS 私有 Bucket：EML、隔离 HTML、附件、桌面发布包、研究报告
   ├── SMQ/MNS：outbound、reconcile、DLQ、terminal、对象删除任务
   ├── SLS/ARMS：日志、指标、追踪和告警
   ├── KMS/Secrets：数据库、内部令牌、provider 密钥
   └── Resend / 阿里云邮件推送：可插拔出站 provider

Web/Electron/Android -> API Gateway/ALB/WAF -> GSYEN API 与 Mail API
                                   │
                                   └── Supabase（过渡）/ 自托管兼容栈（后续）
```

建议首期在同一主地域建立一个 VPC，至少划分公网入口、应用、数据三个交换机/安全域。
RDS、OSS 内网端点和 SMQ 不暴露公网；服务使用 RAM 最小权限访问，不在镜像中写密钥。

## 5. 组件映射与代码改造

| 当前接口 | 目标接口 | 改造方式 |
| --- | --- | --- |
| `env.DB` / D1 SQL | RDS PostgreSQL | 建 `MailDatabase` repository 接口；把 `?` 占位符、D1 batch/returning/trigger 语义改成 PostgreSQL 事务 |
| `env.MAIL_OBJECTS` / R2 | OSS | 建 `MailObjectStore`；保留 object key、content type、quarantine metadata；私有读写和短期签名下载 |
| `env.OUTBOUND_QUEUE` | SMQ/MNS | 建 `MailQueue`；映射 delay、visibility、ack/retry、DLQ；消费者必须允许至少一次投递 |
| Worker `email()` | SMTP ingress adapter | 把 envelope from/to、raw stream、rawSize 转换成平台无关 `InboundEnvelope` |
| Worker `fetch()` | Express/Hono/Fetch adapter | 保持 `/health`、`/v1/*`、CORS、错误码和诊断 header |
| Worker `scheduled()` | SAE Job/FC timer | 执行对象清理、回执重放、卡住任务重排、事故刷新 |
| Resend provider | provider registry | 先原样保留 Resend；新增阿里云 provider，不改变消息状态机 |
| Cloud Run image | ACR + SAE | 复用现有 Dockerfile；GitHub Actions 以 OIDC/RAM 构建、测试、推送与部署 |
| GCS | OSS | `sgsyen-api` 用 OSS SDK 重写签名 URL 和文本读取；路径保持不变 |
| Vercel static/rewrites | OSS+CDN/ESA+API Gateway | 先部署影子域名，逐条验证 SPA fallback、CORS、Cookie 和 API rewrite |
| R2 release bucket | OSS release bucket | 双写发布资产，最后切换 updater URL；旧 R2 保留一个完整版本周期 |

## 6. Supabase 迁移策略

Supabase 当前不只是 PostgreSQL：它承担 Auth、JWT 校验、管理 API、前端 session、
Realtime/客户端查询和多张业务表。直接把数据库导入 RDS 并不能替代 Supabase。

建议分两步：

1. **基础设施第一阶段保留 Supabase**，先迁计算、对象和队列，减少同时变化的故障面；
2. 另立身份/数据 P0 子项目，在 ACK/ECS 上验证自托管 Supabase 或实现兼容 Auth 网关，
   通过双读、影子校验和 JWT 兼容测试后再迁。任何方案都必须保留 user id，避免邮箱
   `owner_id` 与所有业务数据失联。

## 7. 零停机实施顺序

1. 冻结生产架构变更，只做只读盘点与备份；
2. 确认阿里云账号主体、主/灾备地域、预算、VPC、ICP/域名和邮件服务器许可；
3. 用 IaC 创建非生产 VPC、ACR、SAE、RDS、OSS、SMQ、SLS、KMS；
4. 完成平台适配层和 PostgreSQL migration，跑现有 mail worker 全套测试；
5. 从 D1/R2 导出到 RDS/OSS，执行数量、哈希、外键和抽样 MIME 校验；
6. 部署影子 Mail API，使用复制流量/合成探针验证，不让真实客户端写入；
7. 为出站开启受控双写或 shadow provider，禁止重复真实投递；
8. 部署并测试 SMTP ingress；通过独立测试子域收件、反垃圾、附件和编码；
9. 迁移 Web/API/GCS/R2 发布链路，每个单元独立切换和回滚；
10. 满足准入门槛后才提出根域 MX/DNS 变更；低 TTL 窗口内双链路观测；
11. 至少保留旧系统一个完整回滚周期，核对延迟到达邮件后再退役。

## 8. 验收与回滚

必须自动验证：邮箱/别名数量、每文件夹消息数、附件数与字节数、EML SHA-256、
Message-ID 去重、状态机、幂等发送、并发认领、DLQ 重放、HTML 隔离、JWT 权限、
中文/国际地址头、10MB 边界（当前生产配置为 5MiB 时按实际值）、SPF/DKIM/DMARC、
主要外部收件域投递和客户端增量同步。

每个部署单元独立保留旧域名/镜像/数据库快照/对象清单和回滚开关。根域 MX 只有在
Cloudflare 入口仍可恢复、TTL 已满足传播窗口、阿里入口连续通过探针且窗口负责人确认
后才允许修改。

## 9. 当前阻断项

- 尚未取得 Cloudflare D1、R2、Queues、Email Routing 的完整只读统计；
- 尚未导出 Supabase schema、Auth 用户数、业务表容量、Realtime/Storage 使用情况；
- 尚未取得 Google Workspace 中历史邮件与隐藏依赖清单；
- 尚未确认阿里云账号主体、地域、预算、备案、固定 IP、PTR 和邮件服务器许可；
- 尚未确认目标 RPO/RTO、每日邮件量、峰值、总对象量和保留周期。

因此当前可以完成代码适配、IaC、测试和非生产演练，但不能安全地执行生产全量切换。
