# GSYEN Mail Worker

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
- Cloudflare Queues retries transient outbound delivery failures.
- A dedicated DLQ consumer persists exhausted jobs in D1 before acknowledging
  them; operators can inspect and safely replay them without exposing bodies.
- Resend API delivers outbound mail with a stable provider idempotency key.
- HalfSphere Supabase Auth validates the existing GSYEN bearer token.

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

`SUPABASE_ANON_KEY` belongs in `.dev.vars` locally and in a Wrangler secret in
production. Never add the real value to source control.
