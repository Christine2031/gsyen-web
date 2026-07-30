import { requireAdmin, requireInternalService, requireUser } from "./auth";
import { writeAudit } from "./audit";
import { ApiError, corsHeaders, json, readJson } from "./http";
import { routeMessageRequest } from "./messageApi";
import {
  replayDeadLetter,
} from "./deadLetters";
import { getOperationsSnapshot } from "./operations";
import {
  addMailboxAlias,
  createMailbox,
  getMailboxByOwner,
  listMailboxAddresses,
  updateMailboxStatus,
} from "./repository";
import type { MailEnv, MailboxRecord } from "./types";
import {
  normalizeDisplayName,
  normalizeLocalPart,
} from "./validation";

type RegisterBody = { localPart?: unknown; displayName?: unknown };
type InternalRegisterBody = { ownerId?: unknown; localPart?: unknown; displayName?: unknown };
type InternalRevokeBody = { ownerId?: unknown; reason?: unknown };
type AdminStatusBody = { status?: unknown };
type AliasBody = { localPart?: unknown };

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function localPartFromEmail(email: string): string {
  const at = email.indexOf("@");
  return (at >= 0 ? email.slice(0, at) : email).split("+", 1)[0];
}

function deterministicFallbackLocalPart(ownerId: string): string {
  const suffix = ownerId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);
  return `user${suffix || "mailbox"}`.slice(0, 30);
}

function safeLegacyLocalPart(preferred: string, ownerId: string): string {
  const sanitized = preferred
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ".")
    .replace(/[^a-z0-9.]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  try {
    return normalizeLocalPart(sanitized);
  } catch {
    return normalizeLocalPart(deterministicFallbackLocalPart(ownerId));
  }
}

async function createActiveMailboxForUser(env: MailEnv, user: { id: string; email: string; userMetadata: Record<string, unknown> }) {
  const preferred = firstText(
    user.userMetadata.gsyen_username,
    user.userMetadata.username,
    user.userMetadata.preferred_username,
    user.userMetadata.name,
    localPartFromEmail(user.email),
  );
  const mailbox = await createMailbox(env, {
    ownerId: user.id,
    localPart: safeLegacyLocalPart(preferred, user.id),
    displayName: firstText(user.userMetadata.gsyen_display_name, user.userMetadata.display_name, preferred),
  });
  return mailbox.status === "active" ? mailbox : updateMailboxStatus(env, mailbox.id, "active");
}

async function serializeMailbox(env: MailEnv, mailbox: MailboxRecord | null) {
  if (!mailbox) return null;
  return {
    ...mailbox,
    addresses: await listMailboxAddresses(env, mailbox.id),
  };
}

export async function routeRequest(
  request: Request,
  env: MailEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method === "GET" && path === "/health") {
    return json(request, env, { ok: true, service: "gsyen-mail", domain: env.MAIL_DOMAIN });
  }

  if (request.method === "POST" && path === "/v1/internal/mailboxes/register") {
    requireInternalService(request, env);
    const body = await readJson<InternalRegisterBody>(request);
    const ownerId = String(body.ownerId ?? "").trim();
    if (ownerId.length < 8) {
      throw new ApiError(400, "invalid_owner", "Mailbox owner id is required");
    }
    const mailbox = await createMailbox(env, {
      ownerId,
      localPart: normalizeLocalPart(body.localPart),
      displayName: normalizeDisplayName(body.displayName),
    });
    const activeMailbox = mailbox.status === "active"
      ? mailbox
      : await updateMailboxStatus(env, mailbox.id, "active");
    ctx.waitUntil(writeAudit(env, {
      ownerId,
      action: "mailbox.register_internal",
      targetId: activeMailbox.id,
      outcome: "allowed",
      metadata: { registrationSource: "internal" },
    }));
    return json(request, env, {
      mailbox: await serializeMailbox(env, activeMailbox),
      registrationSource: "internal",
    }, 201);
  }

  if (request.method === "POST" && path === "/v1/internal/mailboxes/revoke") {
    requireInternalService(request, env);
    const body = await readJson<InternalRevokeBody>(request);
    const ownerId = String(body.ownerId ?? "").trim();
    if (ownerId.length < 8) {
      throw new ApiError(400, "invalid_owner", "Mailbox owner id is required");
    }
    const mailbox = await getMailboxByOwner(env, ownerId);
    if (!mailbox) {
      throw new ApiError(404, "mailbox_not_found", "Mailbox was not found");
    }
    const revokedMailbox = await updateMailboxStatus(env, mailbox.id, "suspended");
    ctx.waitUntil(writeAudit(env, {
      ownerId,
      action: "mailbox.revoke_internal",
      targetId: revokedMailbox.id,
      outcome: "allowed",
      metadata: { reason: typeof body.reason === "string" ? body.reason.slice(0, 240) : undefined },
    }));
    return json(request, env, {
      mailbox: await serializeMailbox(env, revokedMailbox),
      operation: "revoked",
    }, 200);
  }

  const user = await requireUser(request, env);

  if (request.method === "POST" && path === "/v1/mailboxes/register") {
    const body = await readJson<RegisterBody>(request);
    const mailbox = await createMailbox(env, {
      ownerId: user.id,
      localPart: normalizeLocalPart(body.localPart),
      displayName: normalizeDisplayName(body.displayName),
    });
    ctx.waitUntil(writeAudit(env, {
      ownerId: user.id,
      action: "mailbox.register",
      targetId: mailbox.id,
      outcome: "allowed",
      metadata: { status: mailbox.status },
    }));
    return json(request, env, { mailbox: await serializeMailbox(env, mailbox) }, 201);
  }

  if (request.method === "GET" && path === "/v1/mailboxes/me") {
    const mailbox = await getMailboxByOwner(env, user.id)
      ?? await createActiveMailboxForUser(env, user);
    return json(request, env, {
      mailbox: await serializeMailbox(env, mailbox),
    });
  }

  const messageResponse = await routeMessageRequest(request, env, ctx, user, path, url);
  if (messageResponse) return messageResponse;

  if (request.method === "GET" && path === "/v1/admin/operations") {
    requireAdmin(user);
    return json(request, env, { operations: await getOperationsSnapshot(env) });
  }

  const replayMatch = path.match(
    /^\/v1\/admin\/dead-letters\/([A-Za-z0-9_-]{1,128})\/replay$/,
  );
  if (request.method === "POST" && replayMatch) {
    requireAdmin(user);
    const result = await replayDeadLetter(env, replayMatch[1]);
    await writeAudit(env, {
      ownerId: user.id,
      action: "mail.dead_letter.replay",
      targetId: result.messageId ?? replayMatch[1],
      outcome: "allowed",
      metadata: result,
    });
    return json(request, env, { result });
  }

  const adminMatch = path.match(/^\/v1\/admin\/mailboxes\/([0-9a-f-]{36})\/status$/i);
  if (request.method === "POST" && adminMatch) {
    requireAdmin(user);
    const body = await readJson<AdminStatusBody>(request);
    if (body.status !== "active" && body.status !== "suspended") {
      throw new ApiError(400, "invalid_status", "Status must be active or suspended");
    }
    const mailbox = await updateMailboxStatus(env, adminMatch[1], body.status);
    await writeAudit(env, {
      ownerId: user.id,
      action: `mailbox.${body.status}`,
      targetId: mailbox.id,
      outcome: "allowed",
    });
    return json(request, env, { mailbox: await serializeMailbox(env, mailbox) });
  }

  const aliasMatch = path.match(/^\/v1\/admin\/mailboxes\/([0-9a-f-]{36})\/aliases$/i);
  if (request.method === "POST" && aliasMatch) {
    requireAdmin(user);
    const body = await readJson<AliasBody>(request);
    const alias = await addMailboxAlias(env, aliasMatch[1], normalizeLocalPart(body.localPart));
    await writeAudit(env, {
      ownerId: user.id,
      action: "mailbox.alias.add",
      targetId: alias.mailbox_id,
      outcome: "allowed",
      metadata: { address: alias.address },
    });
    return json(request, env, { alias }, 201);
  }

  throw new ApiError(404, "not_found", "Route was not found");
}
