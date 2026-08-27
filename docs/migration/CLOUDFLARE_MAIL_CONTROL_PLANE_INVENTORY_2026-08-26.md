# Cloudflare 邮件控制面只读盘点

盘点日期：2026-08-26（Asia/Shanghai）  
范围：`gsyen.com` 的 Email Routing、生产 Worker、D1、R2 和 Queues  
操作边界：只查看控制面并执行聚合 `COUNT(*)`；未读取邮件正文、主题、收件地址、对象内容或 Secret 值，未创建、修改、发布或删除任何资源

## 1. 结论

生产收件主链路仍由 Cloudflare 承载，根域 MX 未改。现有资源能够保存当前邮件主记录并处理
Resend 外发队列，但**尚不存在 Stalwart 镜像生产队列、镜像绑定或新镜像数据表**。因此仓库中的
Cloudflare → Queue → 阿里云 `mail-ingest` → Stalwart 实现仍只是未发布候选，不能称为已上线。

本轮还确认生产 D1 只应用到 15 个 migration；仓库当前已有 `0016`—`0022` 邮件镜像及入站
加固 migration。发布 Worker 前必须先备份、审查并按顺序执行数据库 migration，随后再建立
独立的 mirror / DLQ / terminal queues。所有这些都是生产写操作，需单独审批和回滚方案。

## 2. Email Routing 与 DNS

| 项目 | 实际状态 | 判定 |
|---|---|---|
| `gsyen.com` Email Routing | enabled，DNS 状态正常 | 当前生产收件入口 |
| 精确地址规则 | 3 条 active，均交给生产 Worker | 只记录数量，不记录个人邮箱地址 |
| catch-all | 动作为 discard，但规则 disabled | 当前不承接未知地址 |
| 根域 MX | 3 条 Cloudflare Email Routing MX | 保持不变 |
| `mail.gsyen.com` MX | 3 条 Cloudflare Email Routing MX | 保持不变；不是 Stalwart 直收证据 |

本阶段固定架构仍是：Cloudflare 必须先保存主记录，再异步镜像到阿里云。未完成端到端数量、
Message-ID、原始 EML SHA-256、附件和所有收件人核对前，禁止修改根域 MX。

## 3. 生产 Worker

生产 Worker `gsyen-mail-production` 当前部署版本前缀为 `a6d2cc3d`，控制面显示约 24 天前部署，
100% 流量。可见绑定如下：

- D1：`DB`
- R2：`MAIL_OBJECTS`
- Queue producer：`OUTBOUND_QUEUE`
- Secret 名称存在：内部令牌、Resend API key、Supabase anon key；本轮未读取或记录值

没有 `STALWART_MIRROR_QUEUE` 生产绑定，也没有已配置的 mirror endpoint/host。仓库候选配置中
`STALWART_MIRROR_ENABLED=false`，与控制面“尚未上线镜像”的事实一致。

## 4. D1 数据库

生产 D1 `gsyen-mail-production` 控制面大小为 3.08 MB。Data Explorer 可见 11 张业务表；本轮
只执行表级 `COUNT(*)`，没有选择任何业务列：

| 表 | 行数 |
|---|---:|
| `attachments` | 7 |
| `audit_events` | 18 |
| `d1_migrations` | 15 |
| `dead_letter_events` | 0 |
| `mail_operational_incidents` | 0 |
| `mailbox_addresses` | 8 |
| `mailboxes` | 8 |
| `message_sync_events` | 466 |
| `messages` | 500 |
| `object_deletion_jobs` | 0 |
| `send_usage` | 5 |

当前 schema 没有仓库 `0016` 起引入的 Stalwart mirror dead-letter/outbox 表，也没有 `0019`
入站 staging receipt、`0020` delivery hardening、`0021` 可恢复 MIME extraction 或 `0022`
identity contract 对应对象。上述行数是切换前计数基线之一，
不是数据完整性验收：最终仍需按主键、状态、时间、对象键与原始 EML/附件哈希完成对账。

## 5. R2 对象存储

生产 Bucket `gsyen-mail-production`：

- 977 objects，34.98 MB
- APAC，Standard storage
- public access disabled；无 public `r2.dev`，无 custom domain
- 无 CORS、无 event notification、无 bucket lock
- 默认 lifecycle：未完成 multipart upload 7 天后 abort
- 可见前缀：`attachments/`、`html/`、`raw/`、`reconciliation/`

对象数不能与 D1 `messages` 行数机械相等：一封邮件可产生 raw、HTML 和附件等多个对象。
本轮没有打开或下载任何对象。迁移验证需要从受控导出生成“D1 记录 → R2 object key → size →
SHA-256”账本，并处理孤儿对象、缺失对象和未确定写入；当前 977/34.98 MB 只作控制面基线。

同账号还存在以下独立 release Bucket，按无关/发布资产保护，未做任何修改：

| Bucket | 对象数 | 大小 |
|---|---:|---:|
| `gsyen-releases` | 16 | 1.39 GB |
| `gy-shurufa-releases` | 168 | 1.07 GB |
| `gyenbox-releases` | 22 | 1.74 GB |
| `prism-edge-releases` | 11 | 652.36 MB |

这些 Bucket 必须分别核对 Electron、Android 或其他客户端发布引用；不得因邮件迁移而删除。

## 6. Queues

控制面当前只有生产外发队列族，没有任何 Stalwart mirror 队列：

| Queue | 消费者/状态 | 关键配置 |
|---|---|---|
| `gsyen-mail-outbound-production` | 生产 Worker；active | batch 10、max wait 5s、retry 3、delay 60s、retention 1 day、DLQ 指向下项 |
| `gsyen-mail-outbound-dlq-production` | 生产 Worker；active | batch 10、max wait 5s、retry 10、delay 300s、retention 1 day、终端队列指向下项 |
| `gsyen-mail-outbound-dlq-terminal-production` | 无消费者 | 终端保留，但需运维处置流程 |

仓库声明的 `gsyen-mail-stalwart-mirror-production`、mirror DLQ 与 terminal queue 当前均不存在。
生产镜像不能在这些资源创建、绑定、migration、部署和故障注入完成前启用。

Cloudflare 官方当前规定：Queue 默认保留 4 天，付费 Workers 可配置最长 14 天；Free plan
固定为 24 小时。消息到期后会从 Queue 删除，不能把 Queue 本身当作恢复账本，详见
[Queue 配置](https://developers.cloudflare.com/queues/configuration/configure-queues/)与
[Queue 限额](https://developers.cloudflare.com/queues/platform/limits/)。当前账号生产外发队列的
实测 1 天保留必须保留为基线事实；新 mirror 队列采用 1 天还是 14 天取决于届时实际 plan 与
费用审批。无论选择哪项，D1 outbox/terminal ledger 和 R2 raw EML 才是跨过 Queue expiry 的
恢复依据，必须另设 backlog-age、DLQ/terminal critical 告警和受控重放。

## 7. 风险与审批后的执行顺序

| 等级 | 当前事实 | 必须满足的门 |
|---|---|---|
| P0 | 生产无 Stalwart mirror 队列/绑定，不能满足“先保存、后镜像”上线验收 | 完成本地 P0/P1 加固和全量测试；审批后创建独立队列族并影子启用 |
| P1 | D1 仅 15 个 migration，仓库镜像/入站 schema 尚未部署 | 先导出/备份和 schema dry-run；用 expand/deploy/contract 顺序发布，验证后才启用 delivery |
| P1 | D1/R2 跨存储不是原子事务 | 使用 staging receipt、manifest/hash、模糊提交回查和 sweeper；故障注入证明不会误删主记录 |
| P1 | R2 无 bucket lock，Queue retention 仅 1 天 | 建立可恢复导出、告警、terminal 处置与可审计重放；费用或新资源先确认 |
| P1 | 根域收件依赖单个 Worker/生产 D1/R2 | 保留 Cloudflare 为权威入口；阿里云/Stalwart 故障只能延迟镜像，不能拒收或损坏主记录 |

获得生产变更批准后的安全顺序应为：

1. 导出 D1 schema/聚合账本和 R2 object inventory，生成可恢复校验清单；
2. 创建 mirror、DLQ、terminal 三个独立生产队列，记录 plan 对应 retention，并配置消费者边界；
3. 对 production D1 先应用 `0016`—`0021` **expand** migrations，保留旧 Message-ID unique
   index；逐表核对 schema、索引和现有 500 条 message/7 条 attachment；
4. 配置非 Secret host allowlist，单独写入 token Secret；值不得进入 Git 或日志；
5. 发布 receipt-v2-compatible Worker：outbox capture 必须开启，mirror delivery kill switch
   仍为关闭；验证当前收件和 Resend 外发无回归，并等前一 revision 完全 drain；
6. 只有在新 revision 100% 接流且回滚下限已固定为 receipt-v2-compatible 后，才应用 `0022`
   **contract** migration；禁止回滚到旧 Worker；
7. 对测试地址小流量启用 mirror delivery，执行幂等、重复、超时、永久失败、重试、DLQ、
   commit-before-ack 和恢复演练；已有 in-flight HTTP 的停用需同时关闭下游入口并等待超时窗；
8. 完成 D1/R2/Stalwart 的数量、Message-ID、raw SHA-256、附件与全部 envelope recipient 对账；
9. 观察期通过后才扩大镜像流量；根域 MX 仍不修改。

阶段状态：**只读盘点完成；生产镜像未部署，不具备切换或 MX 变更条件。**
