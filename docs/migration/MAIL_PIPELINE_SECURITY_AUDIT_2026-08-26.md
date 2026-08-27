# GSYEN 邮件入站、镜像与恢复安全审计

审计日期：2026-08-26（Asia/Shanghai）  
范围：Cloudflare Email Routing / Worker / D1 / R2 / Queues、阿里云 Caddy /
`mail-ingest` / Stalwart，以及备份、恢复和告警契约  
状态：**本地候选持续加固；生产镜像关闭且未部署；根域 MX 未修改**

## 1. 结论

方案一的故障域方向正确：Cloudflare 保存权威主记录后才允许异步镜像，阿里云、Caddy、
`mail-ingest` 或 Stalwart 故障不会成为公网 SMTP 收件的同步依赖。本地候选已具备 raw EML
哈希、D1 receipt、D1 outbox、Queue/DLQ、稳定 delivery ID、HTTPS allowlist、
`mail-ingest` receipt lease、SMTP 能力协商和重复投递守卫。

但它尚不具备生产启用条件。独立复核没有发现当前 P0；仍有上线前 P1：Stalwart loopback
SMTP 的真实认证边界、receipt 与 Stalwart 的协调恢复/重放、terminal critical 告警和完整
D1→Queue→HTTPS→SMTP→IMAP/JMAP synthetic。所有候选资源、migration 和 Worker revision
都尚未写入生产，所以不能用本地测试声称邮件迁移完成。

## 2. 必须保持的权威顺序

```text
Cloudflare Email Routing
  -> R2 raw EML 写入并读回校验 SHA-256/size/receipt identity
  -> D1 receipt + message/tombstone + durable mirror outbox
  -> SMTP delivery accepted

D1 outbox
  -> Cloudflare Queue -> DLQ -> terminal ledger
  -> HTTPS exact host/path -> Alibaba Caddy -> mail-ingest
  -> durable local receipt/lease -> authenticated Stalwart listener
  -> IMAP/JMAP 可见性核对
```

以下均不允许倒置：

- Queue 不能先于 R2/D1 权威提交；
- Stalwart 成功不能替代 Cloudflare 主记录；
- MIME/HTML/附件提取失败不能让已校验 raw EML 消失或让 SMTP 同步失败；
- Queue ack、HTTP 204、进程 running 或 `/health` 200 不能替代邮箱可见性和数据对账；
- 删除 message 后必须保留受策略控制的 receipt/delivery tombstone，避免旧邮件重新出现。

## 3. 控制面基线

只读控制面盘点见
[`CLOUDFLARE_MAIL_CONTROL_PLANE_INVENTORY_2026-08-26.md`](./CLOUDFLARE_MAIL_CONTROL_PLANE_INVENTORY_2026-08-26.md)。
当前事实为：生产 D1 500 条 message、7 条 attachment、15 个已应用 migration；R2 977
objects / 34.98 MB；只有 outbound Queue 家族，没有 mirror Queue、mirror binding 或
`0016` 之后的表。Worker mirror flag 为关闭。Secret 只核对名称，未读取值。

Cloudflare Queue 会在 retention 到期后删除消息。官方当前说明 Free plan 固定 24 小时，
付费 plan 默认 4 天并可配置最长 14 天：
[配置](https://developers.cloudflare.com/queues/configuration/configure-queues/)、
[限额](https://developers.cloudflare.com/queues/platform/limits/)。因此 Queue 只负责传输，D1
outbox/terminal ledger 与 R2 raw 才是可重放依据。

## 4. 本地实现及审计判定

| 控制项 | 当前本地候选 | 审计判定 |
|---|---|---|
| raw-first | R2 `put` 后重新 `get`，核对 size、metadata 与 SHA-256；失败写 D1 recovery state | 正确方向；仍需真实 R2 故障注入 |
| receipt identity | raw SHA + 原始 envelope-to/target/from 生成幂等身份，不以不可信 RFC Message-ID 去重 | 正确方向 |
| MIME/附件 | extraction lease/chunk/retry/terminal 与主记录分离；高附件数保留 raw 后进入可审计人工处置 | 合并中；稳定后复跑预算测试 |
| capture / delivery | capture 必须在 mirror delivery 关闭时仍建 D1 outbox；flag 只允许停止 Queue/HTTP | 合并中；启用前必须有 flag=false 回归 |
| D1→Queue | D1 为 authority；lease、attempt、stale-enqueued 恢复、DLQ 和 terminal ledger | 正确方向 |
| DLQ commit/ack 窗口 | 同一 Queue ID 使用持久 transition marker，重复/迟到事件不得重复增加 cycle | 本地已修；最终全套待复跑 |
| HTTP 分类 | 401/403/404/408/425/429/5xx/特定 409 可恢复；明确 400/409 conflict/413/422 和 ack mismatch terminal | 本地已修；最终全套待复跑 |
| HTTPS 边界 | HTTPS、唯一 host、固定 path、无 port/userinfo/query/fragment、redirect error、20s timeout | 本地测试通过 |
| mail-ingest auth | 43–128 base64url token，hash 后 timing-safe compare；5 MiB、并发与磁盘余量门禁 | 本地测试通过 |
| delivery identity | Worker 与 ingest 共同校验 delivery ID、raw SHA；envelope case/plus/dot 保真，null reverse-path 支持 | 本地测试通过 |
| SMTP | EHLO multiline、8BITMIME/SMTPUTF8、dot stuffing、4xx/5xx、统一 hard deadline | 本地测试通过 |
| duplicate guard | mail-ingest 把 trusted header 放第一字段；Sieve 依 RFC 7352 首字段语义去重 | 静态正确；真实 Stalwart 版本验证仍为 P1 |
| 日志 | 不记录 token、raw/body 或完整收件人；只记录内部 ID、域和受控 reason | 本地审计通过 |

## 5. expand / deploy / contract

生产当前只到 `0015`。候选发布必须严格按下列顺序，不能把所有 migration 和任意旧 Worker
混在一个不可回滚步骤中：

1. 导出 D1/R2 可恢复账本并校验；
2. 创建 mirror / DLQ / terminal Queue，记录 retention、消费者和告警；
3. 应用 `0016`—`0021` expand，保留旧 `messages_inbound_dedupe`；
4. 发布 receipt-v2-compatible revision，capture 开启、delivery 关闭；
5. 验证当前收件/外发并等待旧 revision/in-flight invocation 完全 drain；
6. 将回滚下限固定为 receipt-v2-compatible revision，再应用 `0022` contract；
7. 禁止回滚到不理解 receipt-v2 的旧 Worker；
8. 只对受控测试地址打开 delivery，完成故障和数据对账后再扩大。

若 expand 窗口遇到复用相同 Message-ID 的不同 raw，必须继续保留 raw/receipt 并在 contract 后
恢复，不能为了绕开旧 unique index 丢弃数据或静默制造重复。

## 6. 仍未解除的 P1

1. **Stalwart 信任边界**：共享 ECS 上仅 loopback 的未认证 SMTP 仍可被其他被攻陷进程
   绕过 HTTPS token。必须锁定目标 Stalwart 版本并建立专用认证 listener（或同等强边界），
   再完成 Sieve 编译、双投递、伪造首/次 header 和 30 天 guard 演练。
2. **协调恢复**：必须把 Stalwart data、mail-ingest receipts 和 Cloudflare D1/R2 时间点建账，
   提供按 trusted delivery ID 的 IMAP/JMAP reconcile 与受控 replay/reset。恢复点不一致时不能
   因旧 receipt 返回 204 而漏回邮箱，也不能无界重复。
3. **端到端监控**：Worker liveness、mail-ingest receipt/SMTP EHLO 不是业务验收。必须把
   terminal、DLQ、stale backlog 和 extraction terminal 设为 critical，并运行
   D1→Queue→HTTPS→SMTP→IMAP/JMAP synthetic。
4. **真实基础设施**：mirror queues、Secret、Caddy site、Stalwart listener、D1 migrations
   尚未创建/应用；任何操作均需生产变更审批、备份和单项回滚。
5. **恢复演练**：阿里云云盘快照、加密异地副本、Stalwart/receipt 恢复和 ECS reboot 后自动
   恢复尚无真实证据。

## 7. 最终验收矩阵

| 验收 | 必须提供的证据 |
|---|---|
| 数量 | 测试窗口 Cloudflare accepted receipts = unique D1 messages = Stalwart delivery IDs；所有 duplicate 单列 |
| Message-ID | RFC Message-ID 作为元数据核对；不作为原始 SMTP 投递身份 |
| raw | R2 raw、HTTPS body、mail-ingest receipt 和 Stalwart 原文 SHA-256 一致 |
| 附件 | count、index、filename、size、MIME 与 SHA-256；HTML 仅安全预览 |
| 收件人 | 原始 envelope-to、canonical mailbox lookup、delivery target 全部核对，含 alias/plus/dot/case |
| 幂等 | 同一 raw retry、commit-before-ack、Queue duplicate、HTTP timeout-after-accept、DLQ replay 均只落一份 |
| 故障 | 阿里云/Caddy/ingest/Stalwart down 不影响 Cloudflare 主收件；恢复后 backlog 自动排空 |
| 恢复 | D1/R2、receipt、Stalwart 分别恢复后 reconcile/replay，无缺件和无界重复 |
| 协议 | IMAP/JMAP/SMTP、中文/UTF-8、HTML、附件、null sender、8BITMIME/SMTPUTF8 均通过 |
| 外发 | Resend 仍是唯一生产外发，退信、重试和配额独立通过 |

结论：**生产镜像保持关闭。只有 P1 清零、备份/恢复与全链路 synthetic 通过并取得生产变更
确认后，才允许启用小流量 mirror delivery；本阶段仍不修改 `gsyen.com` MX。**
