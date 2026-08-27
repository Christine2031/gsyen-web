# GSYEN mail-ingest

Loopback-bound bridge from the Cloudflare Stalwart mirror Queue to the local
Stalwart SMTP listener. It does not receive public SMTP and does not replace
Cloudflare Email Routing or Resend.

## Request contract

`POST /internal/mail/mirror` requires a bearer token plus:

- `Idempotency-Key`: the internal D1 message UUID;
- `X-GSYEN-Envelope-From`: SMTP reverse-path; an empty value means `MAIL FROM:<>`;
- `X-GSYEN-Envelope-To`: a mailbox in `MAIL_DOMAIN`;
- `X-GSYEN-Raw-SHA256`: lowercase or uppercase 64-digit SHA-256 of the original
  EML;
- `X-GSYEN-Delivery-ID`: lowercase stable delivery ID calculated by the Worker;
- body: the original `message/rfc822` bytes.

The service recomputes and compares the hash before touching SMTP. Its stable
delivery ID is SHA-256 of `messageId + NUL + lowercase recipient + NUL + raw
hash`. It prepends trusted `X-GSYEN-Mirror-ID` and `X-GSYEN-Raw-SHA256` fields
before sending the message to loopback SMTP. It independently derives and
checks the delivery ID before creating a receipt. A successful request returns
only `204` and echoes both values as `X-GSYEN-Delivery-ID` and
`X-GSYEN-Raw-SHA256`. `429`, `5xx`, and a `409` explicitly identified as an
in-progress lease are retryable. Validation failures (`400`, metadata-conflict
`409`, `413`, `422`) and a mismatched `204` acknowledgement are permanent and
must be recorded by the Worker before it acknowledges the Queue message.

`MAIL_MIRROR_TOKEN` must contain at least 32 random bytes (for example, generate
it outside Git with
`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`). Startup accepts only
43–128 base64url characters, so the 32-byte minimum is independently enforced.
Authentication hashes both the supplied and configured token to fixed-size
SHA-256 values before a constant-time comparison; neither value is logged.

The authoritative byte-level hash chain ends at the original request: R2 object,
D1 `messages.raw_sha256`, outbox payload/header, `mail-ingest` recomputation and
receipt must match. Do **not** claim that an EML exported from Stalwart becomes
the original merely by stripping the two injected fields. SMTP/Stalwart may add
`Received`, authentication, spam, or delivery fields and may append a terminal
CRLF. Validate the Stalwart semantic mirror by trusted delivery/hash fields when
preserved, RFC Message-ID, recipient, content and decoded attachment hashes.
A byte-identical Stalwart archive would require a separately designed import or
archive path.

## Durable state

Each internal message uses `<sha256-of-idempotency-key>.lease` for exclusive
work and `<sha256-of-idempotency-key>.json` for its receipt. The composite
delivery ID remains inside the receipt and trusted header. Keying files only by
the idempotency key is deliberate: reusing that key with different raw bytes,
recipient, or envelope metadata collides with the existing receipt and fails
closed instead of producing a second SMTP delivery. Receipt updates use a
same-directory temporary file, file fsync, atomic rename, and directory fsync
where supported.
The SMTP pre-state is `delivering`; a 250 response advances it to `accepted`.
Expired leases can be reclaimed. Exact retries of an accepted receipt return
204 with the acknowledgement headers without SMTP; conflicting metadata returns
409 and is never delivered.

The shipped systemd topology is one Node process per receipt directory. An
in-process active claim prevents that process from reclaiming its own expired
lease, and the SMTP transaction has one hard deadline. The configured lease must
be at least twice that deadline. `MAIL_MIRROR_MAX_CONCURRENT_DELIVERIES` also
caps simultaneous MIME buffers and SMTP transactions so a Queue burst cannot
consume all process memory or Stalwart connections. Before every durable
transition the process checks that it still owns the file lease. Do not scale
multiple processes or hosts against one receipt directory; first replace this
file protocol with a database/advisory lock and fencing token.

Receipts retain the internal message ID, parsed RFC Message-ID when present,
recipient, reverse-path, original raw hash/size, delivery ID, attempt counters,
timestamps, failure detail, and SMTP result. Back up the complete receipt
directory; do not remove accepted receipts as routine cleanup.

## Safety gate

`STALWART_DUPLICATE_GUARD_VERIFIED` defaults to false. In that state `/healthz`
and mirror POST both return 503, preventing the SMTP-250 crash window from
creating unguarded duplicates. Follow
[`../stalwart/README.md`](../stalwart/README.md), save the validation evidence,
then set the flag in the protected server environment file. The service never
claims absolute exactly-once semantics.

`/healthz` performs three separate checks: a create/fsync/remove probe in the
receipt directory, minimum free disk space, and an SMTP greeting/EHLO probe with
a hard timeout. Its JSON reports `technicalReady` independently from the manual
RFC 7352 `manualGate`; HTTP 200 requires both. Health and failure logs never emit
the full recipient address (only the recipient domain).

Before `MAIL FROM`, the SMTP client parses multiline EHLO capabilities. It adds
`BODY=8BITMIME` when the raw message contains 8-bit bytes and `SMTPUTF8` when an
envelope address or raw header requires it. If Stalwart does not advertise a
required capability, delivery fails permanently with HTTP 422; the bridge never
silently corrupts or downgrades the message.

The loopback SMTP listener is also a shared-ECS trust boundary: another local
process able to reach it can submit mail outside this bridge. Keep unrelated
services under separate Unix users/cgroups and plan a dedicated authenticated
listener or socket before treating local isolation as a security boundary.

Local verification does not touch production:

```sh
npm test
node --check src/server.mjs
node --check src/smtp.mjs
```
