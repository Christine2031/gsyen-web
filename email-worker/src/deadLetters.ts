import { ApiError } from "./http";
import type { MailEnv, OutboundJob } from "./types";

type DeadLetterKind = "send" | "reconcile" | "invalid";
type DeadLetterStatus = "pending" | "replayed" | "resolved";
const MAX_PROVIDER_ID_LENGTH = 512;
const MAX_INTERNET_MESSAGE_ID_LENGTH = 998;
const MAX_SENT_AT_LENGTH = 64;

function parseJob(value: unknown): {
  job: OutboundJob | null;
  kind: DeadLetterKind;
  messageId: string | null;
} {
  if (!value || typeof value !== "object") {
    return { job: null, kind: "invalid", messageId: null };
  }
  const body = value as Record<string, unknown>;
  const messageId = typeof body.messageId === "string"
    && body.messageId.length > 0
    && body.messageId.length <= 128
    ? body.messageId
    : null;
  if (!messageId) return { job: null, kind: "invalid", messageId: null };
  if (body.kind === "reconcile") {
    const providerMessageId = typeof body.providerMessageId === "string"
      && body.providerMessageId.length > 0
      && body.providerMessageId.length <= MAX_PROVIDER_ID_LENGTH
      ? body.providerMessageId
      : null;
    const sentAt = typeof body.sentAt === "string"
      && body.sentAt.length > 0
      && body.sentAt.length <= MAX_SENT_AT_LENGTH
      && Number.isFinite(Date.parse(body.sentAt))
      ? body.sentAt
      : null;
    const internetMessageId = body.internetMessageId === null
      || (typeof body.internetMessageId === "string"
        && body.internetMessageId.length <= MAX_INTERNET_MESSAGE_ID_LENGTH)
      ? body.internetMessageId as string | null
      : null;
    if (!providerMessageId || !sentAt) {
      return { job: null, kind: "invalid", messageId };
    }
    return {
      kind: "reconcile",
      messageId,
      job: {
        kind: "reconcile",
        messageId,
        providerMessageId,
        internetMessageId,
        sentAt,
      },
    };
  }
  if (body.kind === undefined || body.kind === "send") {
    return { job: { kind: "send", messageId }, kind: "send", messageId };
  }
  return { job: null, kind: "invalid", messageId };
}

function safePayload(
  value: unknown,
  parsed: ReturnType<typeof parseJob>,
): string {
  if (parsed.job) return JSON.stringify(parsed.job);
  try {
    return JSON.stringify(value).slice(0, 2_048);
  } catch {
    return "{}";
  }
}

async function recordDeadLetter(
  env: MailEnv,
  queue: string,
  message: Message<unknown>,
): Promise<void> {
  const parsed = parseJob(message.body);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO dead_letter_events
      (id, source_queue, job_kind, message_id, payload_json, attempts,
       status, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       attempts = MAX(dead_letter_events.attempts, excluded.attempts),
       last_seen_at = excluded.last_seen_at`,
  ).bind(
    message.id,
    queue,
    parsed.kind,
    parsed.messageId,
    safePayload(message.body, parsed),
    Math.max(0, message.attempts),
    now,
    now,
  ).run();
  console.error(JSON.stringify({
    event: "mail_dead_letter_captured",
    deadLetterId: message.id,
    queue,
    jobKind: parsed.kind,
    messageId: parsed.messageId,
    attempts: message.attempts,
  }));
}

export async function consumeDeadLetters(
  batch: MessageBatch<unknown>,
  env: MailEnv,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await recordDeadLetter(env, batch.queue, message);
      message.ack();
    } catch (error) {
      console.error(JSON.stringify({
        event: "mail_dead_letter_persist_failed",
        deadLetterId: message.id,
        error: error instanceof Error ? error.message : String(error),
      }));
      message.retry({ delaySeconds: 300 });
    }
  }
}

export async function replayDeadLetter(
  env: MailEnv,
  deadLetterId: string,
): Promise<{ replayed: boolean; resolution?: string; messageId: string | null }> {
  const row = await env.DB.prepare(
    `SELECT id, payload_json, status, message_id
       FROM dead_letter_events WHERE id = ?`,
  ).bind(deadLetterId).first<{
    id: string;
    payload_json: string;
    status: DeadLetterStatus;
    message_id: string | null;
  }>();
  if (!row) throw new ApiError(404, "dead_letter_not_found", "Dead letter was not found");
  if (row.status !== "pending") {
    throw new ApiError(409, "dead_letter_closed", "Dead letter is already closed");
  }
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  const claim = await env.DB.prepare(
    `UPDATE dead_letter_events SET replay_claimed_at = ?
      WHERE id = ? AND status = 'pending'
        AND (replay_claimed_at IS NULL OR replay_claimed_at < ?)`,
  ).bind(now.toISOString(), deadLetterId, staleBefore).run();
  if (claim.meta.changes !== 1) {
    throw new ApiError(409, "dead_letter_claimed", "Dead letter replay is already in progress");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    await reopenDeadLetter(env, deadLetterId);
    throw new ApiError(409, "dead_letter_invalid", "Dead letter payload cannot be decoded");
  }
  const parsed = parseJob(payload);
  if (!parsed.job) {
    await reopenDeadLetter(env, deadLetterId);
    throw new ApiError(409, "dead_letter_invalid", "Dead letter payload cannot be replayed");
  }
  let dispatchLease: string | null = null;
  if (parsed.kind === "send") {
    const messageId = parsed.messageId;
    if (!messageId) {
      await reopenDeadLetter(env, deadLetterId);
      throw new ApiError(409, "dead_letter_invalid", "Dead letter has no message ID");
    }
    dispatchLease = new Date().toISOString();
    const messageClaim = await env.DB.prepare(
      `UPDATE messages SET status = 'queued', error_code = NULL,
          queue_dispatched_at = ?
        WHERE id = ? AND direction = 'outbound' AND status = 'failed'
          AND trashed_at IS NULL`,
    ).bind(dispatchLease, messageId).run();
    if (messageClaim.meta.changes < 1) {
      return resolveCompetingMessageState(env, deadLetterId, messageId);
    }
  }
  try {
    await env.OUTBOUND_QUEUE.send(parsed.job, { delaySeconds: 5 });
  } catch (error) {
    const recovery: Promise<unknown>[] = [
      reopenDeadLetter(env, deadLetterId),
    ];
    if (parsed.kind === "send" && parsed.messageId && dispatchLease) {
      recovery.push(releaseMessageReplayClaim(
        env,
        parsed.messageId,
        dispatchLease,
      ));
    }
    const recoveryResults = await Promise.allSettled(recovery);
    for (const result of recoveryResults) {
      if (result.status === "rejected") {
        console.error(JSON.stringify({
          event: "mail_dead_letter_replay_recovery_failed",
          deadLetterId,
          error: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        }));
      }
    }
    throw error;
  }
  const replayedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE dead_letter_events SET status = 'replayed',
        replay_count = replay_count + 1, last_replayed_at = ?,
        replay_claimed_at = NULL WHERE id = ?`,
  ).bind(replayedAt, deadLetterId).run();
  return { replayed: true, messageId: parsed.messageId };
}

async function resolveCompetingMessageState(
  env: MailEnv,
  deadLetterId: string,
  messageId: string,
): Promise<{ replayed: false; resolution: string; messageId: string }> {
  const state = await env.DB.prepare(
    `SELECT status, trashed_at FROM messages
      WHERE id = ? AND direction = 'outbound'`,
  ).bind(messageId).first<{ status: string; trashed_at: string | null }>();
  const resolution = !state ? "message_missing"
    : state.trashed_at ? "cancelled_trashed"
      : state.status === "sent" ? "already_sent"
        : state.status === "sending" ? "already_sending"
          : state.status === "queued" ? "already_queued"
            : "message_state_changed";
  await resolveDeadLetter(env, deadLetterId, resolution);
  return { replayed: false, resolution, messageId };
}

async function releaseMessageReplayClaim(
  env: MailEnv,
  messageId: string,
  dispatchLease: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE messages SET status = 'failed',
        error_code = 'dead_letter_replay_enqueue_failed',
        queue_dispatched_at = NULL
      WHERE id = ? AND direction = 'outbound' AND status = 'queued'
        AND queue_dispatched_at = ?`,
  ).bind(messageId, dispatchLease).run();
}

async function reopenDeadLetter(env: MailEnv, deadLetterId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE dead_letter_events SET replay_claimed_at = NULL
      WHERE id = ? AND status = 'pending'`,
  ).bind(deadLetterId).run();
}

async function resolveDeadLetter(
  env: MailEnv,
  deadLetterId: string,
  resolution: string,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE dead_letter_events SET status = 'resolved',
        resolution_code = ?, resolved_at = ?,
        replay_claimed_at = NULL WHERE id = ?`,
  ).bind(resolution, now, deadLetterId).run();
}
