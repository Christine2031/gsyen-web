import type { MailEnv } from "./types";

export async function writeAudit(
  env: MailEnv,
  input: {
    ownerId?: string;
    action: string;
    targetId?: string;
    outcome: "allowed" | "denied" | "failed";
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const safeMetadata = JSON.stringify(input.metadata ?? {}).slice(0, 4_096);
  await env.DB.prepare(
    `INSERT INTO audit_events
      (id, owner_id, action, target_id, outcome, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    input.ownerId ?? null,
    input.action,
    input.targetId ?? null,
    input.outcome,
    safeMetadata,
    new Date().toISOString(),
  ).run();
}

