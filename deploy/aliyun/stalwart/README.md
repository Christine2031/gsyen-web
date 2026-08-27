# Stalwart 镜像邮件重复抑制守卫

本目录只提供受版本管理的模板和验证门禁，**没有修改正在运行的
Stalwart**。在服务器快照、Stalwart 配置/数据文件备份和变更窗口均获批
前，不得应用这些配置。

## 目标布局与版本门禁

模板不把盘点时观察到的版本当作目标版本，也不从旧文档推断配置格式。
候选发布必须同时包含：

- `RELEASE.json` 和 `BUILD.json`；
- `STALWART_RELEASE.json`，明确版本、Linux/amd64 平台、无凭据 HTTPS 来源、
  下载归档 SHA-256 和实际二进制 SHA-256；
- `bin/stalwart`，其字节哈希必须等于上述 manifest。

`validate-stalwart-release.py` 不执行未信任候选，只校验 manifest、文件类型、
执行位和二进制哈希。候选随后使用 `stage-release.sh gsyen stalwart ...` 与
独立批准的 `promote-release.sh`，目标为：

```text
/srv/gsyen/apps/stalwart/releases/<release-id>/bin/stalwart
/srv/gsyen/apps/stalwart/current -> releases/<release-id>
/srv/gsyen/config/stalwart/stalwart.env
/srv/gsyen/config/stalwart/<reviewed-version-specific-config>
/srv/gsyen/data/stalwart/
/srv/gsyen/logs/stalwart/
```

systemd unit 使用独立 `stalwart` 用户、`KillMode=mixed` 和上述数据/日志写入
边界；不再加入能读取核心 GSYEN Secret 的 `gsyen` 组。配置文件名通过受保护
env 的 `STALWART_CONFIG_PATH` 指定，因为未完成精确候选兼容测试前不能假定
JSON、TOML 或任何 schema。

通用备份覆盖新布局。迁移观察期内若旧 `/srv/gsyen/stalwart` 仍存在，备份会
显式加入该 legacy tree，恢复也只在归档含它时恢复。旧副本不得由这些模板自动
删除；版本、数据和配置核对完成后仍需单独删除批准。

现有 Stalwart 的未认证 loopback SMTP 仍是安全门禁：共享 ECS 上其他进程可能
绕过 mail-ingest 的 HTTP token 和收件人校验。启用镜像前必须在精确锁定版本上
建立并验证专用认证 listener、Unix socket 或等效隔离；本模板不会猜测生产配置
并自动改写它。

## 为什么接收回执还不够

`mail-ingest` 会在 SMTP 前原子写入 `delivering`，在 Stalwart 返回 250 后
原子写入 `accepted`。如果进程恰好在这两步之间崩溃，文件回执无法判断
Stalwart 是否已经收下邮件。恢复请求必须再次使用同一个
`X-GSYEN-Mirror-ID`，由 Stalwart 的 RFC 7352 `duplicate` 扩展丢弃重复
副本并仍完成 SMTP 会话。

这是一套有界的应用级幂等机制，不在书面验收中使用“绝对 exactly-once”
表述。RFC 7352 也明确提示并行执行可能存在竞争；本实现用单机排他 lease、
120 秒默认 lease 和 15 秒 SMTP 超时避免正常路径并行投递。

参考：

- Stalwart Trusted Interpreter：<https://stalw.art/docs/sieve/interpreter/trusted/>
- Stalwart Sieve Variables：<https://stalw.art/docs/sieve/variables/>
- RFC 7352：<https://www.rfc-editor.org/rfc/rfc7352.html>

## 模板语义

[`sieve/gsyen-mirror-dedupe.sieve`](sieve/gsyen-mirror-dedupe.sieve) 使用：

- `X-GSYEN-Mirror-ID` 的**第一个**字段值作为唯一标识；该字段由
  `mail-ingest` 在原始 EML 最前面注入。
- 固定 handle `gsyen-cloudflare-mirror-v1`，避免和其他 Sieve 去重规则串扰。
- `2678400` 秒（31 天）跟踪窗口，超过“至少 30 天”的门槛。
- 只处理 `env.remote_ip` 为 `127.0.0.1`、`::1` 或常见 IPv4-mapped
  `::ffff:127.0.0.1` 的 SMTP 会话，防止公网邮件伪造头并污染去重集合。
- 首次出现时不执行 `discard`，由正常投递链保存；后续重复执行
  `discard; stop;`。RFC 7352 规定只有 Sieve 成功结束后才更新去重集合。

## 受控安装步骤

1. 记录当前 Stalwart 版本、二进制 SHA-256、服务 unit、配置路径、数据路径、
   当前 System Scripts 和 DATA Stage `script` 表达式，并完成云盘快照与文件级
   备份。不要假设模板与服务器现状一致。
2. 在 WebAdmin 的 **Settings → Sieve → System Interpreter** 中将
   `duplicateExpiry` 设为不少于 `2678400000` 毫秒（31 天）。脚本自身也用
   `:seconds 2678400` 固定窗口。
3. 在 **Settings → Sieve → System Scripts** 新建或更新名为
   `gsyen_mirror_dedupe` 的 active 系统脚本，内容必须与模板逐字核对。
4. 在 **Settings → MTA → Session → DATA Stage** 让该脚本在 DATA 阶段执行。
   如果服务器已有 DATA Stage 脚本，禁止覆盖：先导出旧脚本，在影子实例按
   当前锁定版本验证 `include`/dispatcher 或安全合并，再保留双方规则。
5. Stalwart 文档说明系统脚本在启动时编译。只有获批变更窗口内才能重载或
   重启服务；重启后先确认 SMTP/IMAP/JMAP 健康，不得直接开启 Worker 镜像。

## 必须通过的验证

使用专用影子邮箱和唯一测试 ID，不使用真实用户邮件：

1. 从非 loopback SMTP 客户端发送一封自带测试 `X-GSYEN-Mirror-ID` 的邮件，
   确认不会写入 GSYEN duplicate 集合或被该规则丢弃。
2. 先从 Stalwart session/Sieve 诊断日志记录该主机实际呈现的
   `env.remote_ip`；若不在模板允许清单中，保持门禁为 false，审查后更新并
   重新验证，禁止直接放宽到任意本地网段。再从 ECS loopback SMTP 连续投递
   两份字节相同、首字段
   `X-GSYEN-Mirror-ID` 相同的 EML；两次 SMTP 都应完成，影子邮箱中只能有
   一份。通过 IMAP/JMAP 同时核对 Message-ID、正文和附件。
3. 使用两个不同 mirror ID 投递相同原始 EML，确认邮箱中出现两份，以证明
   规则没有按普通 Message-ID 或内容误杀。
4. 启动 `mail-ingest`（仍只绑定 `127.0.0.1`），验证 `/healthz` 在门禁为
   false 时返回 503，POST 也返回可重试 503，且 Stalwart 无新增邮件。
5. 只有步骤 1–4 全部通过并保存日志证据后，才把受保护环境文件中的
   `STALWART_DUPLICATE_GUARD_VERIFIED` 改为 `true`。此字段是人工验收声明，
   不是服务自动探测。
6. 发送一份镜像测试邮件，核对本地 receipt 为 `accepted`，其
   `messageId`、`internetMessageId`、`recipient`、`envelopeFrom`、
   `rawSha256`、`rawBytes`、`deliveryId`、`attempts`、时间和 `smtpResult`
   均完整。
7. 仅对影子邮件做崩溃窗演练：保留 receipt 备份后模拟“SMTP 已接收但
   accepted 回执未落盘”，用同一请求恢复。Stalwart 邮箱数量必须仍为 1，
   新 receipt 必须变成 `accepted` 且 attempts 增加。

任一步失败时立即保持 `STALWART_DUPLICATE_GUARD_VERIFIED=false`，让
Cloudflare durable outbox/Queue 继续重试或进入 DLQ；Cloudflare 已保存的主
记录不受 Stalwart 故障影响。

Cloudflare R2 原件、D1 `messages.raw_sha256`、outbox/HTTP 头、`mail-ingest`
重新计算值和 receipt 构成可做逐字节核对的权威 hash 链。Stalwart 中保存的
镜像至少多 `X-GSYEN-Mirror-ID` 和 `X-GSYEN-Raw-SHA256`，还可能由 SMTP/MTA
加入 `Received`、认证、反垃圾或投递字段以及末尾 CRLF。因此**不能**声称只
移除前两个字段即可恢复原始 EML，也不能把 Stalwart 导出文件完整哈希作为
原件相等证据。Stalwart 侧应核对可信 delivery/raw-hash 字段（若导出保留）、
Message-ID、收件人、正文/MIME 结构和解码后附件 hash。若未来要求 Stalwart
保存逐字节相同的归档，必须另行实现并验证专用 import/archive 路径。

## 数据核对与备份

验收表至少逐封包含：Cloudflare 内部 message ID、RFC Message-ID、所有
envelope 收件人、原始 EML SHA-256、原始字节数、附件数量和每个附件
SHA-256、D1 outbox 状态、本地 receipt 状态、Stalwart 邮件 ID。分别汇总：

- D1 `messages.raw_sha256 IS NULL` 和 `attachments.sha256 IS NULL` 的历史缺口；
- outbox `pending/leased/enqueued/delivered/dead_letter/terminal` 数量；
- receipts `delivering/accepted` 数量和 attempts 分布；
- Cloudflare、receipt、Stalwart 三方 Message-ID/哈希/附件不一致清单。

`/srv/gsyen/data/mail-mirror/receipts` 必须纳入独立备份和恢复演练。正常运行
中不得清理 accepted receipts；如果 receipt 丢失且 31 天 Sieve 窗口也已
过期，同一邮件可能再次进入邮箱。
