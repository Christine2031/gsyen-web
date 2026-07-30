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
    ctx.waitUntil(writeAudit(env, {
      ownerId,
      action: "mailbox.register_internal",
      targetId: mailbox.id,
      outcome: "allowed",
      metadata: { registrationSource: "internal" },
    }));
    return json(request, env, {
      mailbox: await serializeMailbox(env, mailbox),
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
    return json(request, env, {
      mailbox: await serializeMailbox(env, await getMailboxByOwner(env, user.id)),
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
