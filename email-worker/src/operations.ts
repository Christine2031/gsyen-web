import type { MailEnv } from "./types";

type DeadLetterRow = {
  id: string;
  source_queue: string;
  job_kind: "send" | "reconcile" | "invalid";
  message_id: string | null;
  attempts: number;
  status: "pending" | "replayed" | "resolved";
  replay_count: number;
  resolution_code: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_replayed_at: string | null;
};

type IncidentRow = {
  kind: string;
  severity: "warning" | "critical";
  status: "open" | "resolved";
  count: number;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};

export type OperationsSnapshot = {
  healthy: boolean;
  pendingDeadLetters: number;
  failedOutbound24h: number;
  staleOutbound: number;
  oldestPendingDeadLetterAt: string | null;
  incidents: IncidentRow[];
  deadLetters: DeadLetterRow[];
};

async function countRow(
  env: MailEnv,
  sql: string,
  ...bindings: unknown[]
): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...bindings)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getOperationsSnapshot(
  env: MailEnv,
): Promise<OperationsSnapshot> {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60_000).toISOString();
  const queuedBefore = new Date(now - 5 * 60_000).toISOString();
  const sendingBefore = new Date(now - 10 * 60_000).toISOString();
  const [pendingDeadLetters, failedOutbound24h, staleOutbound, oldest, incidents, deadLetters] =
    await Promise.all([
      countRow(
        env,
        "SELECT COUNT(*) AS count FROM dead_letter_events WHERE status = 'pending'",
      ),
      countRow(
        env,
        `SELECT COUNT(*) AS count FROM messages
          WHERE direction = 'outbound' AND status = 'failed'
            AND created_at >= ? AND COALESCE(error_code, '') <> 'cancelled_trashed'`,
        dayAgo,
      ),
      countRow(
        env,
        `SELECT COUNT(*) AS count FROM messages
          WHERE direction = 'outbound' AND trashed_at IS NULL
            AND ((status = 'queued' AND created_at < ?)
              OR (status = 'sending' AND last_attempt_at < ?))`,
        queuedBefore,
        sendingBefore,
      ),
      env.DB.prepare(
        `SELECT MIN(first_seen_at) AS oldest
           FROM dead_letter_events WHERE status = 'pending'`,
      ).first<{ oldest: string | null }>(),
      env.DB.prepare(
        `SELECT kind, severity, status, count, occurrence_count,
                first_seen_at, last_seen_at, resolved_at
           FROM mail_operational_incidents
          ORDER BY status ASC, last_seen_at DESC LIMIT 20`,
      ).all<IncidentRow>(),
      env.DB.prepare(
        `SELECT id, source_queue, job_kind, message_id, attempts, status,
                replay_count, resolution_code, first_seen_at, last_seen_at,
                last_replayed_at
           FROM dead_letter_events ORDER BY last_seen_at DESC LIMIT 50`,
      ).all<DeadLetterRow>(),
    ]);
  return {
    healthy: pendingDeadLetters === 0 && staleOutbound === 0,
    pendingDeadLetters,
    failedOutbound24h,
    staleOutbound,
    oldestPendingDeadLetterAt: oldest?.oldest ?? null,
    incidents: incidents.results,
    deadLetters: deadLetters.results,
  };
}

async function updateIncident(
  env: MailEnv,
  kind: string,
  severity: IncidentRow["severity"],
  count: number,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    "SELECT status FROM mail_operational_incidents WHERE kind = ?",
  ).bind(kind).first<{ status: IncidentRow["status"] }>();
  if (count > 0) {
    await env.DB.prepare(
      `INSERT INTO mail_operational_incidents
        (kind, severity, status, count, detail_json, occurrence_count,
         first_seen_at, last_seen_at)
       VALUES (?, ?, 'open', ?, ?, 1, ?, ?)
       ON CONFLICT(kind) DO UPDATE SET severity = excluded.severity,
         status = 'open', count = excluded.count,
         detail_json = excluded.detail_json,
         occurrence_count = mail_operational_incidents.occurrence_count + 1,
         last_seen_at = excluded.last_seen_at, resolved_at = NULL`,
    ).bind(kind, severity, count, JSON.stringify({ count }), now, now).run();
    console.error(JSON.stringify({ event: "mail_ops_incident", kind, severity, count }));
  } else if (existing?.status === "open") {
    await env.DB.prepare(
      `UPDATE mail_operational_incidents
          SET status = 'resolved', count = 0, last_seen_at = ?, resolved_at = ?
        WHERE kind = ?`,
    ).bind(now, now, kind).run();
    console.log(JSON.stringify({ event: "mail_ops_incident_resolved", kind }));
  }
}

export async function refreshOperationalIncidents(env: MailEnv): Promise<void> {
  const snapshot = await getOperationsSnapshot(env);
  await Promise.all([
    updateIncident(env, "pending_dead_letters", "critical", snapshot.pendingDeadLetters),
    updateIncident(env, "stale_outbound", "critical", snapshot.staleOutbound),
    updateIncident(env, "failed_outbound_24h", "warning", snapshot.failedOutbound24h),
  ]);
}
