import { ApiError, json } from "./http";
import { logMessageApiPhase } from "./messageApiDiagnostics";
import { serializeMessage } from "./messageSerialization";
import { listMessageChanges } from "./repository";
import type { MailEnv, MailboxRecord } from "./types";

function parseChangeCursor(value: string | null): number {
  if (value === null) return 0;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new ApiError(400, "invalid_sync_cursor", "Sync cursor is invalid");
  }
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor)) {
    throw new ApiError(400, "invalid_sync_cursor", "Sync cursor is invalid");
  }
  return cursor;
}

export async function routeMessageChanges(
  request: Request,
  env: MailEnv,
  mailbox: MailboxRecord,
  path: string,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "GET" || path !== "/v1/messages/changes") return null;
  const after = parseChangeCursor(url.searchParams.get("after"));
  logMessageApiPhase(request, "message_changes_query_start", { after });
  const changes = await listMessageChanges(env, mailbox.id, after, 51);
  const page = changes.slice(0, 50);
  logMessageApiPhase(request, "message_changes_query_complete", { count: page.length });
  return json(request, env, {
    changes: page.map((change) => ({
      cursor: change.sequence,
      operation: change.operation,
      messageId: change.messageId,
      message: change.message ? serializeMessage(change.message) : null,
    })),
    nextCursor: changes.length > 50 ? page.at(-1)?.sequence ?? null : null,
  });
}
