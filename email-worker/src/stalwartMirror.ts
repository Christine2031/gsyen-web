import type { MailEnv, StalwartMirrorJob } from "./types";

const DELIVERY_RETRY_DELAY_SECONDS = 60;
const DEAD_LETTER_RETRY_DELAY_SECONDS = 300;
const DEAD_LETTER_CLAIM_TIMEOUT_MS = 5 * 60_000;
const DEAD_LETTER_MAX_REQUEUE_ATTEMPTS = 6;
const OUTBOX_LEASE_MS = 5 * 60_000;
const OUTBOX_BASE_RETRY_SECONDS = 60;
const OUTBOX_MAX_RETRY_SECONDS = 6 * 60 * 60;
const OUTBOX_DEFAULT_BATCH_SIZE = 20;
const OUTBOX_MAX_BATCH_SIZE = 100;
const MIRROR_FETCH_TIMEOUT_MS = 20_000;
export const STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS = 12;
export const STALWART_MIRROR_MAX_DELIVERY_CYCLES = 3;
export const STALWART_MIRROR_ENQUEUED_RECOVERY_MS = 24 * 60 * 60_000;

type StalwartMirrorOutboxRow = {
  idempotency_key: string;
  raw_object_key: string;
  delivery_id: string | null;
  payload_json: string;
  attempts: number;
};

type StalwartMirrorAuthorityRow = StalwartMirrorOutboxRow & {
  message_id: string;
  status: "pending" | "leased" | "enqueued" | "delivered" | "dead_letter" | "terminal";
  delivery_cycles: number;
};

type StalwartMirrorDeadLetterReceipt = {
  message_id: string;
  payload_json: string;
  status: "pending" | "requeueing" | "requeued";
};

type TerminalEventPhase = "delivery" | "dead_letter" | "scheduled_requeue";

class StalwartMirrorDeliveryError extends Error {
  readonly retryable: boolean;
  readonly delaySeconds: number;

  constructor(
    message: string,
    options: { retryable: boolean; delaySeconds?: number },
  ) {
    super(message);
    this.name = "StalwartMirrorDeliveryError";
    this.retryable = options.retryable;
    this.delaySeconds = options.delaySeconds ?? DELIVERY_RETRY_DELAY_SECONDS;
  }
}

export type StalwartMirrorOutboxDrainResult = {
  inspected: number;
  enqueued: number;
  failed: number;
  terminal: number;
};

export type StalwartMirrorOutboxDrainOptions = {
  limit?: number;
  now?: Date;
};

export function isStalwartMirrorEnabled(env: MailEnv): boolean {
  return env.STALWART_MIRROR_ENABLED?.trim().toLowerCase() === "true";
}

function configured(env: MailEnv): boolean {
  if (
    !env.STALWART_MIRROR_QUEUE
    || !env.STALWART_MIRROR_TOKEN?.trim()
    || !env.STALWART_MIRROR_ALLOWED_HOST?.trim()
  ) {
    return false;
  }
  try {
    secureMirrorUrl(env);
    return true;
  } catch {
    return false;
  }
}

function secureMirrorUrl(env: MailEnv): string {
  const value = env.STALWART_MIRROR_URL?.trim();
  if (!value) throw new Error("stalwart_mirror_url_missing");
  const allowedHost = env.STALWART_MIRROR_ALLOWED_HOST?.trim().toLowerCase();
  if (!allowedHost
    || allowedHost.length > 253
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(allowedHost)) {
    throw new Error("stalwart_mirror_allowed_host_invalid");
  }
  const url = new URL(value);
  if (url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
    || url.search
    || url.port
    || url.hostname.toLowerCase() !== allowedHost
    || url.pathname !== "/internal/mail/mirror") {
    throw new Error("stalwart_mirror_url_not_allowlisted");
  }
  return url.toString();
}

function validJob(value: unknown): value is StalwartMirrorJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<StalwartMirrorJob>;
  return job.kind === "stalwart_mirror"
    && typeof job.messageId === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(job.messageId)
    && typeof job.rawObjectKey === "string"
    && job.rawObjectKey.length > 0
    && job.rawObjectKey.length <= 1_024
    && !/[\u0000-\u001f\u007f]/.test(job.rawObjectKey)
    && typeof job.rawSha256 === "string"
    && /^[0-9a-f]{64}$/.test(job.rawSha256)
    && typeof job.deliveryId === "string"
    && /^[0-9a-f]{64}$/.test(job.deliveryId)
    && typeof job.envelopeFrom === "string"
    && job.envelopeFrom.length <= 254
    && !/[\u0000-\u0020\u007f<>]/.test(job.envelopeFrom)
    && (job.envelopeFrom === ""
      || /^[^\s<>@]+@[^\s<>@]+$/.test(job.envelopeFrom))
    && typeof job.recipient === "string"
    && job.recipient.length <= 254
    && !/[\u0000-\u0020\u007f<>]/.test(job.recipient)
    && /^[^\s<>@]+@[^\s<>@]+$/.test(job.recipient);
}

export async function deriveStalwartMirrorDeliveryId(
  messageId: string,
  recipient: string,
  rawSha256: string,
): Promise<string> {
  const value = new TextEncoder().encode(
    `${messageId}\u0000${recipient.toLowerCase()}\u0000${rawSha256}`,
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(
    OUTBOX_MAX_RETRY_SECONDS,
    OUTBOX_BASE_RETRY_SECONDS * (2 ** Math.min(Math.max(0, attempt - 1), 12)),
  );
}

function retryAfterSeconds(response: Response): number {
  const value = response.headers.get("Retry-After");
  if (value === null || value.trim() === "") return DELIVERY_RETRY_DELAY_SECONDS;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(3_600, Math.max(1, Math.trunc(parsed)))
    : DELIVERY_RETRY_DELAY_SECONDS;
}

function candidateIdentifiers(value: unknown): {
  messageId: string | null;
  deliveryId: string | null;
} {
  if (!value || typeof value !== "object") {
    return { messageId: null, deliveryId: null };
  }
  const candidate = value as { messageId?: unknown; deliveryId?: unknown };
  return {
    messageId: typeof candidate.messageId === "string"
      && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(candidate.messageId)
      ? candidate.messageId
      : null,
    deliveryId: typeof candidate.deliveryId === "string"
      && /^[0-9a-f]{64}$/.test(candidate.deliveryId)
      ? candidate.deliveryId
      : null,
  };
}

function terminalEventStatement(
  env: MailEnv,
  options: {
    phase: TerminalEventPhase;
    queueMessageId: string;
    messageId: string | null;
    deliveryId: string | null;
    reason: string;
    outboxStatus: string | null;
    observedAt: string;
  },
): D1PreparedStatement {
  const id = `${options.phase}:${options.queueMessageId}:${options.reason}`;
  return env.DB.prepare(
    `INSERT INTO stalwart_mirror_terminal_events
      (id, phase, queue_message_id, message_id, delivery_id, reason,
       outbox_status, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET observed_at = excluded.observed_at`,
  ).bind(
    id,
    options.phase,
    options.queueMessageId,
    options.messageId,
    options.deliveryId,
    options.reason,
    options.outboxStatus,
    options.observedAt,
  );
}

async function persistTerminal(
  env: MailEnv,
  options: {
    phase: TerminalEventPhase;
    queueMessageId: string;
    job: unknown;
    reason: string;
    authority: StalwartMirrorAuthorityRow | null;
    terminalizeOutbox?: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const identifiers = candidateIdentifiers(options.job);
  const statements: D1PreparedStatement[] = [];
  if (
    options.authority
    && options.terminalizeOutbox !== false
    && !["delivered", "terminal"].includes(options.authority.status)
  ) {
    statements.push(env.DB.prepare(
      `UPDATE stalwart_mirror_outbox
          SET status = 'terminal', lease_token = NULL, lease_expires_at = NULL,
              last_error = ?, terminal_at = COALESCE(terminal_at, ?), updated_at = ?
        WHERE idempotency_key = ?
          AND status NOT IN ('delivered', 'terminal')`,
    ).bind(
      options.reason,
      now,
      now,
      options.authority.idempotency_key,
    ));
  }
  statements.push(terminalEventStatement(env, {
    phase: options.phase,
    queueMessageId: options.queueMessageId,
    messageId: options.authority?.message_id ?? identifiers.messageId,
    deliveryId: options.authority?.delivery_id ?? identifiers.deliveryId,
    reason: options.reason,
    outboxStatus: options.authority?.status ?? null,
    observedAt: now,
  }));
  await env.DB.batch(statements);
}

async function findAuthority(
  env: MailEnv,
  messageId: string,
): Promise<StalwartMirrorAuthorityRow | null> {
  return env.DB.prepare(
    `SELECT idempotency_key, message_id, raw_object_key, delivery_id,
            payload_json, status, attempts, delivery_cycles
       FROM stalwart_mirror_outbox
      WHERE idempotency_key = ? LIMIT 1`,
  ).bind(messageId).first<StalwartMirrorAuthorityRow>();
}

async function findDeadLetterReceipt(
  env: MailEnv,
  queueMessageId: string,
): Promise<StalwartMirrorDeadLetterReceipt | null> {
  return env.DB.prepare(
    `SELECT message_id, payload_json, status
       FROM stalwart_mirror_dead_letters
      WHERE id = ? LIMIT 1`,
  ).bind(queueMessageId).first<StalwartMirrorDeadLetterReceipt>();
}

function deadLetterReceiptMatches(
  receipt: StalwartMirrorDeadLetterReceipt,
  job: StalwartMirrorJob,
): boolean {
  if (receipt.message_id !== job.messageId) return false;
  try {
    const candidate: unknown = JSON.parse(receipt.payload_json);
    return validJob(candidate)
      && candidate.messageId === job.messageId
      && candidate.rawObjectKey === job.rawObjectKey
      && candidate.rawSha256 === job.rawSha256
      && candidate.deliveryId === job.deliveryId
      && candidate.envelopeFrom === job.envelopeFrom
      && candidate.recipient === job.recipient;
  } catch {
    return false;
  }
}

async function loadAuthority(
  env: MailEnv,
  job: StalwartMirrorJob,
): Promise<{
  authority: StalwartMirrorAuthorityRow | null;
  conflict: string | null;
}> {
  const authority = await findAuthority(env, job.messageId);
  if (!authority) return { authority: null, conflict: "outbox_missing" };

  let payload: StalwartMirrorJob;
  try {
    const parsed: unknown = JSON.parse(authority.payload_json);
    if (!validJob(parsed)) throw new Error("invalid");
    payload = parsed;
  } catch {
    return { authority, conflict: "outbox_payload_invalid" };
  }
  const derivedDeliveryId = await deriveStalwartMirrorDeliveryId(
    payload.messageId,
    payload.recipient,
    payload.rawSha256,
  );
  const metadataMatches = authority.idempotency_key === authority.message_id
    && authority.idempotency_key === payload.messageId
    && authority.raw_object_key === payload.rawObjectKey
    && authority.delivery_id === payload.deliveryId
    && payload.deliveryId === derivedDeliveryId
    && Number.isSafeInteger(authority.delivery_cycles)
    && authority.delivery_cycles >= 0
    && job.messageId === payload.messageId
    && job.rawObjectKey === payload.rawObjectKey
    && job.rawSha256 === payload.rawSha256
    && job.deliveryId === payload.deliveryId
    && job.envelopeFrom === payload.envelopeFrom
    && job.recipient === payload.recipient;
  return {
    authority,
    conflict: metadataMatches ? null : "outbox_metadata_conflict",
  };
}

async function markQueueAccepted(
  env: MailEnv,
  authority: StalwartMirrorAuthorityRow,
): Promise<void> {
  if (authority.status === "enqueued") return;
  const now = new Date().toISOString();
  const marked = await env.DB.prepare(
    `UPDATE stalwart_mirror_outbox
        SET status = 'enqueued', lease_token = NULL, lease_expires_at = NULL,
            enqueued_at = COALESCE(enqueued_at, ?), dead_lettered_at = NULL,
            updated_at = ?
      WHERE idempotency_key = ? AND status = ? AND delivery_cycles = ?`,
  ).bind(
    now,
    now,
    authority.idempotency_key,
    authority.status,
    authority.delivery_cycles,
  ).run();
  if (marked.meta.changes !== 1) {
    throw new Error("stalwart_mirror_outbox_status_changed");
  }
}

async function deferQueueMessageWhileMirrorInactive(
  message: Message<StalwartMirrorJob>,
  env: MailEnv,
  phase: "delivery" | "dead_letter",
): Promise<boolean> {
  if (isStalwartMirrorEnabled(env) && configured(env)) return false;

  const reason = isStalwartMirrorEnabled(env)
    ? "stalwart_mirror_unconfigured_queue_deferred"
    : "stalwart_mirror_disabled_queue_deferred";
  const reconciled = await loadAuthority(env, message.body);
  if (reconciled.conflict) {
    await persistTerminal(env, {
      phase,
      queueMessageId: message.id,
      job: message.body,
      reason: reconciled.conflict,
      authority: reconciled.authority,
    });
    message.ack();
    console.error(JSON.stringify({
      event: "stalwart_mirror_inactive_authority_conflict_terminal",
      queueMessageId: message.id,
      messageId: message.body.messageId,
      reason: reconciled.conflict,
    }));
    return true;
  }

  const authority = reconciled.authority!;
  if (["delivered", "terminal"].includes(authority.status)) {
    message.ack();
    return true;
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [env.DB.prepare(
    `UPDATE stalwart_mirror_outbox
        SET status = 'pending',
            attempts = CASE WHEN attempts >= ? THEN 0 ELSE attempts END,
            next_attempt_at = ?,
            lease_token = NULL, lease_expires_at = NULL, enqueued_at = NULL,
            dead_lettered_at = NULL, terminal_at = NULL,
            last_error = ?, updated_at = ?
      WHERE idempotency_key = ?
        AND status NOT IN ('delivered', 'terminal')`,
  ).bind(
    STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS,
    now,
    reason,
    now,
    authority.idempotency_key,
  )];
  if (phase === "dead_letter") {
    statements.push(env.DB.prepare(
      `INSERT INTO stalwart_mirror_dead_letters
        (id, message_id, payload_json, attempts, status, first_seen_at,
         last_seen_at, requeued_at)
       VALUES (?, ?, ?, ?, 'requeued', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         attempts = MAX(stalwart_mirror_dead_letters.attempts, excluded.attempts),
         status = 'requeued', last_seen_at = excluded.last_seen_at,
         requeued_at = COALESCE(stalwart_mirror_dead_letters.requeued_at,
                                excluded.requeued_at)`,
    ).bind(
      message.id,
      message.body.messageId,
      JSON.stringify(message.body),
      Math.max(0, message.attempts),
      now,
      now,
      now,
    ));
  }
  const results = await env.DB.batch(statements);
  if (results[0].meta.changes !== 1) {
    const current = await findAuthority(env, authority.idempotency_key);
    if (!current || !["delivered", "terminal"].includes(current.status)) {
      throw new Error("stalwart_mirror_inactive_defer_state_changed");
    }
  }
  message.ack();
  console.log(JSON.stringify({
    event: "stalwart_mirror_queue_deferred_while_inactive",
    phase,
    messageId: message.body.messageId,
    reason,
  }));
  return true;
}

export function createStalwartMirrorOutboxStatement(
  env: MailEnv,
  job: StalwartMirrorJob,
  now: string,
): D1PreparedStatement | null {
  if (!isStalwartMirrorEnabled(env)) return null;
  return env.DB.prepare(
    `INSERT INTO stalwart_mirror_outbox
      (idempotency_key, message_id, raw_object_key, delivery_id, payload_json, status, attempts,
       next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`,
  ).bind(
    job.messageId,
    job.messageId,
    job.rawObjectKey,
    job.deliveryId,
    JSON.stringify(job),
    now,
    now,
    now,
  );
}

export async function enqueueStalwartMirror(
  env: MailEnv,
  job: StalwartMirrorJob,
): Promise<void> {
  if (!isStalwartMirrorEnabled(env)) return;
  if (!configured(env)) {
    throw new Error("stalwart_mirror_enabled_but_not_configured");
  }
  await env.STALWART_MIRROR_QUEUE!.send(job);
}

export async function drainStalwartMirrorOutbox(
  env: MailEnv,
  options: StalwartMirrorOutboxDrainOptions = {},
): Promise<StalwartMirrorOutboxDrainResult> {
  const result: StalwartMirrorOutboxDrainResult = {
    inspected: 0,
    enqueued: 0,
    failed: 0,
    terminal: 0,
  };
  if (!isStalwartMirrorEnabled(env)) return result;
  if (!configured(env)) {
    console.error(JSON.stringify({
      event: "stalwart_mirror_outbox_not_configured",
    }));
    return result;
  }

  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const staleEnqueuedBefore = new Date(
    now.getTime() - STALWART_MIRROR_ENQUEUED_RECOVERY_MS,
  ).toISOString();
  const requestedLimit = options.limit ?? OUTBOX_DEFAULT_BATCH_SIZE;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(OUTBOX_MAX_BATCH_SIZE, Math.max(1, Math.trunc(requestedLimit)))
    : OUTBOX_DEFAULT_BATCH_SIZE;
  const recovered = await env.DB.prepare(
    `UPDATE stalwart_mirror_outbox
        SET status = 'pending', next_attempt_at = ?, enqueued_at = NULL,
            last_error = 'stale_enqueued_recovered', updated_at = ?
      WHERE status = 'enqueued'
        AND (enqueued_at IS NULL OR enqueued_at <= ?)`,
  ).bind(nowIso, nowIso, staleEnqueuedBefore).run();
  if (recovered.meta.changes > 0) {
    console.error(JSON.stringify({
      event: "stalwart_mirror_stale_enqueued_recovered",
      count: recovered.meta.changes,
    }));
  }
  const swept = await env.DB.prepare(
    `UPDATE stalwart_mirror_outbox
        SET status = 'terminal', lease_token = NULL, lease_expires_at = NULL,
            last_error = COALESCE(last_error, 'outbox_attempts_exhausted'),
            terminal_at = COALESCE(terminal_at, ?), updated_at = ?
      WHERE attempts >= ?
        AND (
          status = 'pending'
          OR (status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        )`,
  ).bind(
    nowIso,
    nowIso,
    STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS,
    nowIso,
  ).run();
  result.terminal += swept.meta.changes;
  const rows = await env.DB.prepare(
    `SELECT idempotency_key, raw_object_key, delivery_id, payload_json, attempts
       FROM stalwart_mirror_outbox
      WHERE attempts < ?
        AND (
          (status = 'pending' AND next_attempt_at <= ?)
          OR
          (status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        )
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT ?`,
  ).bind(
    STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS,
    nowIso,
    nowIso,
    limit,
  ).all<StalwartMirrorOutboxRow>();
  result.inspected = rows.results.length;

  for (const row of rows.results) {
    const leaseToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + OUTBOX_LEASE_MS).toISOString();
    const claim = await env.DB.prepare(
      `UPDATE stalwart_mirror_outbox
          SET status = 'leased', lease_token = ?, lease_expires_at = ?,
              attempts = attempts + 1, updated_at = ?
        WHERE idempotency_key = ? AND attempts = ? AND attempts < ?
          AND (
            (status = 'pending' AND next_attempt_at <= ?)
            OR
            (status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
          )`,
    ).bind(
      leaseToken,
      leaseExpiresAt,
      nowIso,
      row.idempotency_key,
      row.attempts,
      STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS,
      nowIso,
      nowIso,
    ).run();
    if (claim.meta.changes !== 1) continue;

    const attempt = row.attempts + 1;
    let job: StalwartMirrorJob;
    try {
      const parsed: unknown = JSON.parse(row.payload_json);
      if (
        !validJob(parsed)
        || parsed.messageId !== row.idempotency_key
        || parsed.rawObjectKey !== row.raw_object_key
        || parsed.deliveryId !== row.delivery_id
      ) {
        throw new Error("stalwart_mirror_invalid_outbox_payload");
      }
      job = parsed;
    } catch (error) {
      await env.DB.prepare(
        `UPDATE stalwart_mirror_outbox
            SET status = 'terminal', lease_token = NULL, lease_expires_at = NULL,
                last_error = ?, terminal_at = ?, updated_at = ?
          WHERE idempotency_key = ? AND status = 'leased' AND lease_token = ?`,
      ).bind(
        safeError(error),
        nowIso,
        nowIso,
        row.idempotency_key,
        leaseToken,
      ).run();
      result.terminal += 1;
      continue;
    }

    try {
      await env.STALWART_MIRROR_QUEUE!.send(job);
    } catch (error) {
      const detail = safeError(error);
      const terminal = attempt >= STALWART_MIRROR_OUTBOX_MAX_ATTEMPTS;
      const nextAttemptAt = new Date(
        now.getTime() + retryDelaySeconds(attempt) * 1_000,
      ).toISOString();
      try {
        await env.DB.prepare(
          `UPDATE stalwart_mirror_outbox
              SET status = ?, lease_token = NULL, lease_expires_at = NULL,
                  next_attempt_at = ?, last_error = ?, terminal_at = ?, updated_at = ?
            WHERE idempotency_key = ? AND status = 'leased' AND lease_token = ?`,
        ).bind(
          terminal ? "terminal" : "pending",
          nextAttemptAt,
          detail,
          terminal ? nowIso : null,
          nowIso,
          row.idempotency_key,
          leaseToken,
        ).run();
      } catch (releaseError) {
        console.error(JSON.stringify({
          event: "stalwart_mirror_outbox_release_failed",
          idempotencyKey: row.idempotency_key,
          error: safeError(releaseError),
        }));
      }
      if (terminal) result.terminal += 1;
      else result.failed += 1;
      console.error(JSON.stringify({
        event: terminal
          ? "stalwart_mirror_outbox_terminal"
          : "stalwart_mirror_outbox_enqueue_failed",
        idempotencyKey: row.idempotency_key,
        attempt,
        error: detail,
      }));
      continue;
    }

    try {
      const marked = await env.DB.prepare(
        `UPDATE stalwart_mirror_outbox
            SET status = 'enqueued', lease_token = NULL, lease_expires_at = NULL,
                last_error = NULL, enqueued_at = ?, updated_at = ?
          WHERE idempotency_key = ? AND status = 'leased' AND lease_token = ?`,
      ).bind(
        nowIso,
        nowIso,
        row.idempotency_key,
        leaseToken,
      ).run();
      if (marked.meta.changes !== 1) {
        console.error(JSON.stringify({
          event: "stalwart_mirror_outbox_claim_lost_after_enqueue",
          idempotencyKey: row.idempotency_key,
        }));
      }
    } catch (error) {
      // The queue already durably accepted the job. Keep the lease so a later
      // scheduled drain can safely retry with the same idempotency key.
      console.error(JSON.stringify({
        event: "stalwart_mirror_outbox_mark_enqueued_failed",
        idempotencyKey: row.idempotency_key,
        error: safeError(error),
      }));
    }
    result.enqueued += 1;
  }

  return result;
}

async function deliver(
  env: MailEnv,
  job: StalwartMirrorJob,
): Promise<"delivered"> {
  const raw = await env.MAIL_OBJECTS.get(job.rawObjectKey);
  if (!raw) {
    throw new StalwartMirrorDeliveryError(
      "stalwart_mirror_raw_object_missing",
      { retryable: false },
    );
  }

  let response: Response;
  try {
    response = await fetch(secureMirrorUrl(env), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.STALWART_MIRROR_TOKEN}`,
        "Content-Type": "message/rfc822",
        "Idempotency-Key": job.messageId,
        "X-GSYEN-Envelope-From": job.envelopeFrom,
        "X-GSYEN-Envelope-To": job.recipient,
        "X-GSYEN-Raw-SHA256": job.rawSha256,
        "X-GSYEN-Delivery-ID": job.deliveryId,
      },
      body: raw.body,
      redirect: "error",
      signal: AbortSignal.timeout(MIRROR_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new StalwartMirrorDeliveryError(
      `stalwart_mirror_fetch_${safeError(error)}`,
      { retryable: true },
    );
  }
  if (response.status !== 204) {
    const headerCode = response.headers.get("X-GSYEN-Error-Code");
    const gatewayCode = headerCode && /^[a-z0-9_:-]{1,100}$/.test(headerCode)
      ? headerCode
      : null;
    const inProgress = response.status === 409
      && [
        "delivery_in_progress",
        "lease_contention",
        "delivery_lease_lost",
      ].includes(gatewayCode ?? "");
    const retryable = [401, 403, 404, 408, 425, 429].includes(response.status)
      || response.status >= 500
      || inProgress;
    throw new StalwartMirrorDeliveryError(
      `stalwart_mirror_http_${response.status}_${gatewayCode ?? "unspecified"}`,
      {
        retryable,
        delaySeconds: retryAfterSeconds(response),
      },
    );
  }
  if (
    response.headers.get("X-GSYEN-Delivery-ID") !== job.deliveryId
    || response.headers.get("X-GSYEN-Raw-SHA256") !== job.rawSha256
  ) {
    throw new StalwartMirrorDeliveryError(
      "stalwart_mirror_ack_mismatch",
      { retryable: false },
    );
  }
  return "delivered";
}

export async function consumeStalwartMirror(
  batch: MessageBatch<StalwartMirrorJob>,
  env: MailEnv,
): Promise<void> {
  for (const message of batch.messages) {
    if (!validJob(message.body)) {
      try {
        await persistTerminal(env, {
          phase: "delivery",
          queueMessageId: message.id,
          job: message.body,
          reason: "queue_job_invalid",
          authority: null,
          terminalizeOutbox: false,
        });
        console.error(JSON.stringify({
          event: "stalwart_mirror_invalid_job_terminal",
          queueMessageId: message.id,
        }));
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({
          event: "stalwart_mirror_invalid_job_persist_failed",
          queueMessageId: message.id,
          error: safeError(error),
        }));
        message.retry({ delaySeconds: DELIVERY_RETRY_DELAY_SECONDS });
      }
      continue;
    }
    try {
      if (await deferQueueMessageWhileMirrorInactive(message, env, "delivery")) {
        continue;
      }
      const reconciled = await loadAuthority(env, message.body);
      if (reconciled.conflict) {
        await persistTerminal(env, {
          phase: "delivery",
          queueMessageId: message.id,
          job: message.body,
          reason: reconciled.conflict,
          authority: reconciled.authority,
        });
        message.ack();
        console.error(JSON.stringify({
          event: "stalwart_mirror_authority_conflict_terminal",
          queueMessageId: message.id,
          messageId: message.body.messageId,
          reason: reconciled.conflict,
        }));
        continue;
      }
      const authority = reconciled.authority!;
      if (["delivered", "terminal"].includes(authority.status)) {
        message.ack();
        console.log(JSON.stringify({
          event: authority.status === "delivered"
            ? "stalwart_mirror_late_duplicate_ignored"
            : "stalwart_mirror_terminal_duplicate_ignored",
          messageId: message.body.messageId,
        }));
        continue;
      }
      if (authority.delivery_cycles >= STALWART_MIRROR_MAX_DELIVERY_CYCLES) {
        await persistTerminal(env, {
          phase: "delivery",
          queueMessageId: message.id,
          job: message.body,
          reason: "delivery_cycles_exhausted",
          authority,
        });
        message.ack();
        continue;
      }
      await markQueueAccepted(env, authority);
      await deliver(env, message.body);
      const now = new Date().toISOString();
      const marked = await env.DB.prepare(
        `UPDATE stalwart_mirror_outbox
            SET status = 'delivered', delivered_at = ?, updated_at = ?,
                last_error = NULL
          WHERE idempotency_key = ? AND status = 'enqueued'`,
      ).bind(now, now, message.body.messageId).run();
      if (marked.meta.changes !== 1) {
        throw new Error("stalwart_mirror_delivery_status_changed");
      }
      message.ack();
      console.log(JSON.stringify({
        event: "stalwart_mirror_delivered",
        messageId: message.body.messageId,
      }));
    } catch (error) {
      if (error instanceof StalwartMirrorDeliveryError && !error.retryable) {
        try {
          const reconciled = await loadAuthority(env, message.body);
          await persistTerminal(env, {
            phase: "delivery",
            queueMessageId: message.id,
            job: message.body,
            reason: error.message,
            authority: reconciled.authority,
          });
          message.ack();
          console.error(JSON.stringify({
            event: "stalwart_mirror_permanent_failure_terminal",
            messageId: message.body.messageId,
            error: error.message,
          }));
          continue;
        } catch (persistError) {
          console.error(JSON.stringify({
            event: "stalwart_mirror_terminal_persist_failed",
            messageId: message.body.messageId,
            error: safeError(persistError),
          }));
        }
      }
      console.error(JSON.stringify({
        event: "stalwart_mirror_failed",
        messageId: message.body.messageId,
        error: safeError(error),
      }));
      message.retry({
        delaySeconds: error instanceof StalwartMirrorDeliveryError
          ? error.delaySeconds
          : DELIVERY_RETRY_DELAY_SECONDS,
      });
    }
  }
}

export async function consumeStalwartMirrorDeadLetters(
  batch: MessageBatch<StalwartMirrorJob>,
  env: MailEnv,
): Promise<void> {
  for (const message of batch.messages) {
    if (!validJob(message.body)) {
      try {
        await persistTerminal(env, {
          phase: "dead_letter",
          queueMessageId: message.id,
          job: message.body,
          reason: "dead_letter_job_invalid",
          authority: null,
          terminalizeOutbox: false,
        });
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({
          event: "stalwart_mirror_invalid_dead_letter_persist_failed",
          queueMessageId: message.id,
          error: safeError(error),
        }));
        message.retry({ delaySeconds: DEAD_LETTER_RETRY_DELAY_SECONDS });
      }
      continue;
    }
    try {
      if (await deferQueueMessageWhileMirrorInactive(message, env, "dead_letter")) {
        continue;
      }
      const reconciled = await loadAuthority(env, message.body);
      if (reconciled.conflict) {
        await persistTerminal(env, {
          phase: "dead_letter",
          queueMessageId: message.id,
          job: message.body,
          reason: reconciled.conflict,
          authority: reconciled.authority,
        });
        message.ack();
        continue;
      }
      const authority = reconciled.authority!;
      const existingReceipt = await findDeadLetterReceipt(env, message.id);
      if (existingReceipt) {
        if (!deadLetterReceiptMatches(existingReceipt, message.body)) {
          throw new Error("stalwart_mirror_dead_letter_id_conflict");
        }
        const duplicateAt = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE stalwart_mirror_dead_letters
              SET attempts = MAX(attempts, ?), last_seen_at = ?
            WHERE id = ? AND message_id = ?`,
        ).bind(
          Math.max(0, message.attempts),
          duplicateAt,
          message.id,
          message.body.messageId,
        ).run();
        if (["delivered", "terminal"].includes(authority.status)) {
          await resolveSettledStalwartMirrorDeadLetters(env, duplicateAt);
        }
        message.ack();
        console.log(JSON.stringify({
          event: "stalwart_mirror_dead_letter_duplicate_ignored",
          queueMessageId: message.id,
          messageId: message.body.messageId,
          outboxStatus: authority.status,
          receiptStatus: existingReceipt.status,
        }));
        continue;
      }
      if (["delivered", "terminal"].includes(authority.status)) {
        const settledAt = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO stalwart_mirror_dead_letters
            (id, message_id, payload_json, attempts, status, first_seen_at,
             last_seen_at, requeued_at)
           VALUES (?, ?, ?, ?, 'requeued', ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = 'requeued', last_seen_at = excluded.last_seen_at,
             requeued_at = COALESCE(stalwart_mirror_dead_letters.requeued_at,
                                    excluded.requeued_at)`,
        ).bind(
          message.id,
          message.body.messageId,
          JSON.stringify(message.body),
          Math.max(0, message.attempts),
          settledAt,
          settledAt,
          settledAt,
        ).run();
        message.ack();
        continue;
      }
      const now = new Date().toISOString();
      const nextCycle = authority.delivery_cycles + 1;
      const terminal = nextCycle >= STALWART_MIRROR_MAX_DELIVERY_CYCLES;
      const outboxStatus = terminal ? "terminal" : "dead_letter";
      const finalReason = terminal
        ? "delivery_cycles_exhausted"
        : "queue_delivery_exhausted";
      // This transient marker ties the outbox transition to this exact Queue
      // event inside one D1 batch. It prevents a concurrent redelivery from
      // manufacturing a receipt for a transition that it did not perform.
      const transitionMarker = `${finalReason}:${message.id}`;
      const statements = [
        env.DB.prepare(
          `UPDATE stalwart_mirror_outbox
              SET status = ?, delivery_cycles = delivery_cycles + 1,
                  dead_lettered_at = ?, updated_at = ?,
                  last_error = ?, terminal_at = ?
            WHERE idempotency_key = ? AND delivery_cycles = ?
              AND status NOT IN ('delivered', 'terminal')
              AND NOT EXISTS (
                SELECT 1 FROM stalwart_mirror_dead_letters WHERE id = ?
              )`,
        ).bind(
          outboxStatus,
          now,
          now,
          transitionMarker,
          terminal ? now : null,
          message.body.messageId,
          authority.delivery_cycles,
          message.id,
        ),
        env.DB.prepare(
          `INSERT INTO stalwart_mirror_dead_letters
            (id, message_id, payload_json, attempts, status, first_seen_at,
             last_seen_at, requeued_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM stalwart_mirror_outbox
               WHERE idempotency_key = ? AND delivery_cycles = ?
                 AND status = ? AND last_error = ?
            )
           ON CONFLICT(id) DO UPDATE SET
             attempts = MAX(stalwart_mirror_dead_letters.attempts, excluded.attempts),
             last_seen_at = excluded.last_seen_at`,
        ).bind(
          message.id,
          message.body.messageId,
          JSON.stringify(message.body),
          Math.max(0, message.attempts),
          terminal ? "requeued" : "pending",
          now,
          now,
          terminal ? now : null,
          message.body.messageId,
          nextCycle,
          outboxStatus,
          transitionMarker,
        ),
        env.DB.prepare(
          `UPDATE stalwart_mirror_outbox
              SET last_error = ?
            WHERE idempotency_key = ? AND delivery_cycles = ?
              AND status = ? AND last_error = ?
              AND EXISTS (
                SELECT 1 FROM stalwart_mirror_dead_letters
                 WHERE id = ? AND message_id = ?
              )`,
        ).bind(
          finalReason,
          message.body.messageId,
          nextCycle,
          outboxStatus,
          transitionMarker,
          message.id,
          message.body.messageId,
        ),
      ];
      if (terminal) {
        statements.push(terminalEventStatement(env, {
          phase: "dead_letter",
          queueMessageId: message.id,
          messageId: authority.message_id,
          deliveryId: authority.delivery_id,
          reason: "delivery_cycles_exhausted",
          outboxStatus: authority.status,
          observedAt: now,
        }));
      }
      const results = await env.DB.batch(statements);
      if (results[0].meta.changes !== 1) {
        const duplicate = await findDeadLetterReceipt(env, message.id);
        if (duplicate && deadLetterReceiptMatches(duplicate, message.body)) {
          await resolveSettledStalwartMirrorDeadLetters(env, now);
          message.ack();
          continue;
        }
        throw new Error("stalwart_mirror_dead_letter_state_changed");
      }
      if (results[1].meta.changes !== 1 || results[2].meta.changes !== 1) {
        throw new Error("stalwart_mirror_dead_letter_receipt_not_committed");
      }
      await resolveSettledStalwartMirrorDeadLetters(env, now);
      message.ack();
    } catch (error) {
      console.error(JSON.stringify({
        event: "stalwart_mirror_dead_letter_persist_failed",
        queueMessageId: message.id,
        error: safeError(error),
      }));
      message.retry({ delaySeconds: DEAD_LETTER_RETRY_DELAY_SECONDS });
    }
  }
}

async function resolveSettledStalwartMirrorDeadLetters(
  env: MailEnv,
  now: string,
): Promise<number> {
  const result = await env.DB.prepare(
    `UPDATE stalwart_mirror_dead_letters AS dead
        SET status = 'requeued', requeued_at = COALESCE(requeued_at, ?),
            last_seen_at = ?
      WHERE status IN ('pending', 'requeueing')
        AND EXISTS (
          SELECT 1 FROM stalwart_mirror_outbox AS mirror
           WHERE mirror.idempotency_key = dead.message_id
             AND mirror.status IN ('delivered', 'terminal')
        )`,
  ).bind(now, now).run();
  return result.meta.changes;
}

export async function requeueStalwartMirrorDeadLetters(env: MailEnv): Promise<number> {
  if (!isStalwartMirrorEnabled(env) || !configured(env)) return 0;
  const now = new Date();
  const nowIso = now.toISOString();
  const staleClaim = new Date(
    now.getTime() - DEAD_LETTER_CLAIM_TIMEOUT_MS,
  ).toISOString();
  await resolveSettledStalwartMirrorDeadLetters(env, nowIso);
  const exhaustedRows = await env.DB.prepare(
    `SELECT dead.id, dead.message_id, dead.requeue_attempts,
            mirror.delivery_cycles
       FROM stalwart_mirror_dead_letters AS dead
       JOIN stalwart_mirror_outbox AS mirror
         ON mirror.idempotency_key = dead.message_id
        AND mirror.status = 'dead_letter'
      WHERE dead.status IN ('pending', 'requeueing')
        AND (dead.requeue_attempts >= ? OR mirror.delivery_cycles >= ?)
      ORDER BY dead.last_seen_at ASC LIMIT 20`,
  ).bind(
    DEAD_LETTER_MAX_REQUEUE_ATTEMPTS,
    STALWART_MIRROR_MAX_DELIVERY_CYCLES,
  ).all<{
    id: string;
    message_id: string;
    requeue_attempts: number;
    delivery_cycles: number;
  }>();
  for (const exhausted of exhaustedRows.results) {
    const authority = await findAuthority(env, exhausted.message_id);
    const reason = exhausted.delivery_cycles
      >= STALWART_MIRROR_MAX_DELIVERY_CYCLES
      ? "delivery_cycles_exhausted"
      : "dead_letter_requeue_attempts_exhausted";
    await persistTerminal(env, {
      phase: "scheduled_requeue",
      queueMessageId: exhausted.id,
      job: null,
      reason,
      authority,
    });
    const terminalAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE stalwart_mirror_dead_letters
          SET status = 'requeued', requeued_at = COALESCE(requeued_at, ?),
              last_seen_at = ?
        WHERE id = ? AND status IN ('pending', 'requeueing')`,
    ).bind(terminalAt, terminalAt, exhausted.id).run();
  }
  const rows = await env.DB.prepare(
    `SELECT dead.id, dead.message_id, dead.payload_json, dead.requeue_attempts
       FROM stalwart_mirror_dead_letters AS dead
       JOIN stalwart_mirror_outbox AS mirror
         ON mirror.idempotency_key = dead.message_id
        AND mirror.status = 'dead_letter'
        AND mirror.delivery_cycles < ?
      WHERE dead.requeue_attempts < ?
        AND (
          dead.status = 'pending'
          OR (dead.status = 'requeueing' AND dead.last_seen_at <= ?)
        )
      ORDER BY dead.last_seen_at ASC LIMIT 20`,
  ).bind(
    STALWART_MIRROR_MAX_DELIVERY_CYCLES,
    DEAD_LETTER_MAX_REQUEUE_ATTEMPTS,
    staleClaim,
  ).all<{
    id: string;
    message_id: string;
    payload_json: string;
    requeue_attempts: number;
  }>();
  let requeued = 0;
  for (const row of rows.results) {
    const claim = await env.DB.prepare(
      `UPDATE stalwart_mirror_dead_letters
          SET status = 'requeueing', last_seen_at = ?,
              requeue_attempts = requeue_attempts + 1
        WHERE id = ? AND requeue_attempts = ? AND requeue_attempts < ?
          AND (status = 'pending'
            OR (status = 'requeueing' AND last_seen_at <= ?))
          AND EXISTS (
            SELECT 1 FROM stalwart_mirror_outbox AS mirror
             WHERE mirror.idempotency_key = stalwart_mirror_dead_letters.message_id
               AND mirror.status = 'dead_letter'
               AND mirror.delivery_cycles < ?
          )`,
    ).bind(
      nowIso,
      row.id,
      row.requeue_attempts,
      DEAD_LETTER_MAX_REQUEUE_ATTEMPTS,
      staleClaim,
      STALWART_MIRROR_MAX_DELIVERY_CYCLES,
    ).run();
    if (claim.meta.changes !== 1) continue;
    let parsed: StalwartMirrorJob | null = null;
    let authority: StalwartMirrorAuthorityRow | null = null;
    try {
      authority = await findAuthority(env, row.message_id);
      const candidate: unknown = JSON.parse(row.payload_json);
      if (!validJob(candidate)) {
        throw new StalwartMirrorDeliveryError(
          "stalwart_mirror_invalid_dead_letter",
          { retryable: false },
        );
      }
      parsed = candidate;
      const reconciled = await loadAuthority(env, parsed);
      authority = reconciled.authority;
      if (reconciled.conflict) {
        throw new StalwartMirrorDeliveryError(
          reconciled.conflict,
          { retryable: false },
        );
      }
      if (!authority || authority.status !== "dead_letter") {
        throw new Error("stalwart_mirror_dead_letter_status_changed");
      }
      await env.STALWART_MIRROR_QUEUE!.send(parsed, { delaySeconds: 5 });
      const requeuedAt = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE stalwart_mirror_dead_letters
              SET status = 'requeued', requeued_at = ? WHERE id = ?`,
        ).bind(requeuedAt, row.id),
        env.DB.prepare(
          `UPDATE stalwart_mirror_outbox
              SET status = 'enqueued', enqueued_at = ?, updated_at = ?,
                  dead_lettered_at = NULL, last_error = NULL
            WHERE idempotency_key = ? AND status = 'dead_letter'`,
        ).bind(requeuedAt, requeuedAt, parsed.messageId),
      ]);
      requeued += 1;
    } catch (error) {
      const exhausted = row.requeue_attempts + 1
        >= DEAD_LETTER_MAX_REQUEUE_ATTEMPTS;
      const permanent = error instanceof StalwartMirrorDeliveryError
        && !error.retryable;
      if (permanent || exhausted) {
        await persistTerminal(env, {
          phase: "scheduled_requeue",
          queueMessageId: row.id,
          job: parsed,
          reason: permanent
            ? error.message
            : "dead_letter_requeue_attempts_exhausted",
          authority,
        });
        const terminalAt = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE stalwart_mirror_dead_letters
              SET status = 'requeued', requeued_at = ?, last_seen_at = ?
            WHERE id = ? AND status = 'requeueing'`,
        ).bind(terminalAt, terminalAt, row.id).run();
      } else {
        await env.DB.prepare(
          `UPDATE stalwart_mirror_dead_letters
              SET status = 'pending', last_seen_at = ?
            WHERE id = ? AND status = 'requeueing'`,
        ).bind(new Date().toISOString(), row.id).run();
      }
      console.error(JSON.stringify({
        event: "stalwart_mirror_dead_letter_requeue_failed",
        deadLetterId: row.id,
        terminal: permanent || exhausted,
        error: safeError(error),
      }));
    }
  }
  await resolveSettledStalwartMirrorDeadLetters(
    env,
    new Date().toISOString(),
  );
  return requeued;
}
