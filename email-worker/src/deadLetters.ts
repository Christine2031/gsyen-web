import { ApiError } from "./http";
import { markOutboundDispatched } from "./repository";
import type { MailEnv, OutboundJob } from "./types";

type DeadLetterKind = "send" | "reconcile" | "invalid";
type DeadLetterStatus = "pending" | "replayed" | "resolved";

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
      ? body.providerMessageId
      : null;
    const sentAt = typeof body.sentAt === "string" ? body.sentAt : null;
    const internetMessageId = body.internetMessageId === null
      || typeof body.internetMessageId === "string"
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

function safePayload(value: unknown): string {
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
    safePayload(message.body),
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
  if (parsed.kind === "send") {
    const state = await env.DB.prepare(
      `SELECT status, trashed_at FROM messages
        WHERE id = ? AND direction = 'outbound'`,
    ).bind(parsed.messageId).first<{ status: string; trashed_at: string | null }>();
    if (!state || state.status === "sent" || state.trashed_at) {
      const resolution = !state ? "message_missing"
        : state.status === "sent" ? "already_sent" : "cancelled_trashed";
      await resolveDeadLetter(env, deadLetterId, resolution);
      return { replayed: false, resolution, messageId: parsed.messageId };
    }
    if (state.status === "sending") {
      await reopenDeadLetter(env, deadLetterId);
      throw new ApiError(409, "message_in_flight", "Message is currently being sent");
    }
    await env.DB.prepare(
      `UPDATE messages SET status = 'queued', error_code = NULL,
          queue_dispatched_at = NULL WHERE id = ?`,
    ).bind(parsed.messageId).run();
  }
  try {
    await env.OUTBOUND_QUEUE.send(parsed.job, { delaySeconds: 5 });
    if (parsed.messageId) await markOutboundDispatched(env, parsed.messageId);
  } catch (error) {
    await reopenDeadLetter(env, deadLetterId);
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
