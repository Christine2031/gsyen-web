# GSYEN Mail Worker

> **P0 项目决策（2026-08-24）：** `gsyen.com` 核心邮件系统计划从现有
> Google / Google Workspace 逐步迁移至阿里云。当前仅允许盘点和方案设计；在负责人
> 明确确认产品、切换窗口与回滚方案前，禁止修改生产 MX/DNS 或停用现有服务。详见
> [阿里云邮件迁移 P0 计划](../docs/GSYEN_ALIYUN_MAIL_MIGRATION_P0.md)。

Cloudflare + Stalwart + Resend 的并行投递实现和上线边界见
[混合邮件架构上线手册](../docs/GSYEN_HYBRID_MAIL_ROLLOUT.md)。镜像功能默认关闭，
不能仅因代码或 Queue 已部署就启用生产投递。

Independent email backend for GSYEN. It provides authenticated mailbox
registration, inbound email ingestion, outbound email delivery, inbox/sent
storage, daily quotas, audit events, and an approval gate.

This package does not change the existing GSYEN frontend. It is designed to be
integrated with the existing Mail UI only after a separate frontend approval.

## Safety boundary

- The only public mailbox domain is `gsyen.com`.
- `mail-api.gsyen.com` is an internal HTTPS API hostname, not an email domain.
- HalfSphere Supabase verifies identity only; mail data is stored separately.
- New registrations are `pending` by default.
- HTML email is quarantined in R2 and is not returned by the current API.
- Sending accepts plain text only and is limited to 10 recipients per message.
- Production outbound delivery uses the verified Resend `gsyen.com` domain and a Worker Secret.

## Architecture

- Cloudflare Email Routing invokes the Worker's `email()` handler.
- PostalMime parses a bounded raw message after a 5 MiB size check.
- D1 stores mailbox, message, quota, and audit metadata.
- R2 stores raw MIME, quarantined HTML, and attachments.
- D1 records a SHA-256 for every newly accepted raw EML and attachment; the raw
  R2 object carries the same hash as custom metadata for reconciliation.
- Migration `0019_inbound_ingest_receipts.sql` removes RFC Message-ID as an
  idempotency constraint. Each SMTP delivery is keyed by the raw EML hash plus
  its original envelope recipient, explicit delivery target, and reverse-path;
  Message-ID remains queryable metadata, so reused Message-IDs cannot discard
  different bytes.
- The original envelope recipient, canonical mailbox lookup key, and Stalwart
  delivery target are persisted separately. Dot/plus/alias normalization is
  used only for mailbox lookup and never rewrites the SMTP mirror target.
- Before writing R2, D1 creates an ingest receipt with the complete expected
  object manifest and attachment hashes. Final message metadata and the
  receipt's `committed` state are written in one D1 batch. An uncertain R2 or
  D1 result is retained as `reconcile_needed`; scheduled maintenance checks
  every listed object, receipt ID, raw hash, and attachment hash, then reports
  it through `pendingInboundIngest` instead of guessing that a failed response
  means the objects should be deleted.
- Messages with more than 32 parsed attachments are explicitly rejected; no
  attachment list is silently truncated.
- Cloudflare Queues retries transient outbound delivery failures.
- A dedicated DLQ consumer persists exhausted jobs in D1 before acknowledging
  them; operators can inspect and safely replay them without exposing bodies.
- Resend API delivers outbound mail with a stable provider idempotency key.
- HalfSphere Supabase Auth validates the existing GSYEN bearer token.
- When explicitly enabled, the inbound D1 transaction also writes a durable
  Stalwart mirror outbox row. Queue delivery sends the expected raw SHA-256 to
  the loopback-only Alibaba `mail-ingest` service. The mirror is not ready for
  production until migrations `0016` and later (including inbound receipt
  migration `0019` and delivery-hardening migration `0020`) and the RFC 7352
  guard described in
  [`deploy/aliyun/stalwart`](../deploy/aliyun/stalwart/README.md) are installed
  and verified; Cloudflare remains the primary saved record and Resend remains
  the sole production outbound provider.
- Mirror Queue and persistence failures use a D1 DLQ plus an unconsumed terminal
  Queue. An `enqueued` D1 row older than 24 hours is reported unhealthy and
  safely re-enqueued with the same delivery ID, covering Queue retention,
  accidental purge, and a DLQ consumer that could not persist during a D1
  outage. Provision and alert on every environment's `*-dlq-terminal` Queue
  before enabling the mirror.
- Before every mirror HTTP request, the Queue job is reconciled against the D1
  outbox key, raw object key/hash, stable delivery ID, recipient, and status.
  Poison or conflicting jobs are persisted as terminal events. Only `429`,
  `5xx`, and an explicitly identified in-progress `409` are HTTP-retryable;
  replay is bounded to three Queue-to-DLQ cycles, and the terminal Queue is not
  consumed back into the main Queue.
- `STALWART_MIRROR_ENABLED=false` is a hard delivery kill switch, including for
  jobs already present in the main Queue or DLQ. An enabled but incomplete or
  invalid mirror configuration fails the same way: no HTTP delivery occurs;
  an authoritative non-terminal outbox row is returned to `pending` only after
  a durable D1 update, and the Queue message is then acknowledged. DLQ delivery
  cycles are preserved. Re-enabling a complete configuration lets the scheduled
  outbox drain enqueue the same authoritative payload; poison remains terminal.

Detailed reasoning and alternatives are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Production setup is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## API

All `/v1/*` routes require `Authorization: Bearer <Supabase access token>`.
Sending also requires a stable `Idempotency-Key` header with 16–80 safe
characters so a client retry cannot produce a duplicate email.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health |
| `POST` | `/v1/mailboxes/register` | Reserve a mailbox; pending by default |
| `GET` | `/v1/mailboxes/me` | Current mailbox and status |
| `GET` | `/v1/messages?folder=inbox` | List inbox, sent, or outbox |
| `GET` | `/v1/messages/:id` | Read a message's safe plain-text view |
| `POST` | `/v1/messages/send` | Queue a plain-text message |
| `POST` | `/v1/admin/mailboxes/:id/status` | Activate or suspend a mailbox |
| `GET` | `/v1/admin/operations` | Read redacted incidents and DLQ status |
| `POST` | `/v1/admin/dead-letters/:id/replay` | Safely replay one pending job |

An administrator must have `app_metadata.mail_admin=true` in Supabase Auth.

Example registration request:

```json
{
  "localPart": "ethan",
  "displayName": "Ethan"
}
```

Example send request:

```json
{
  "to": ["friend@example.com"],
  "cc": [],
  "subject": "Hello",
  "text": "Sent from GSYEN Mail."
}
```

## Local verification

```powershell
Copy-Item .dev.vars.example .dev.vars
npm install
npm run migrate:local
npm run check
npx wrangler deploy --dry-run --env development --outdir dist
```

Before publishing Worker code that uses the new inbound path, apply migration
`0019_inbound_ingest_receipts.sql` first. The runtime schema guard refuses new
inbound ingestion if the receipt columns/table are absent or if the legacy
`messages_inbound_dedupe` unique index still exists. A release preflight should
verify that the following query returns zero before deployment:

```sql
SELECT COUNT(*) AS legacy_indexes
FROM sqlite_master
WHERE type = 'index' AND name = 'messages_inbound_dedupe';
```

Do not purge `reconcile_needed` receipts or their R2 manifest objects manually.
Resolve the receipt against its `message_id`, hashes, envelope fields, and every
manifest key first; cleanup remains an explicit operator decision.

`SUPABASE_ANON_KEY` belongs in `.dev.vars` locally and in a Wrangler secret in
production. Never add the real value to source control.
