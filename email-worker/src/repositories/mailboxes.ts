import {
  canonicalizeLocalPart,
  canonicalizeLookupLocalPart,
} from "../validation";
import { ApiError } from "../http";
import type {
  MailEnv,
  MailboxAddressRecord,
  MailboxRecord,
} from "../types";

const MAILBOX_COLUMNS = `
  id, owner_id, local_part, address, display_name, status,
  canonical_local_part, created_at, approved_at
`;

export async function getMailboxByOwner(
  env: MailEnv,
  ownerId: string,
): Promise<MailboxRecord | null> {
  return env.DB.prepare(
    `SELECT ${MAILBOX_COLUMNS} FROM mailboxes WHERE owner_id = ?`,
  ).bind(ownerId).first<MailboxRecord>();
}

export async function getMailboxByAddress(
  env: MailEnv,
  address: string,
): Promise<MailboxRecord | null> {
  const normalized = address.trim().toLowerCase();
  const exact = await env.DB.prepare(
    `SELECT b.id, b.owner_id, b.local_part, b.address, b.display_name,
            b.status, b.created_at, b.approved_at
       FROM mailbox_addresses a
       JOIN mailboxes b ON b.id = a.mailbox_id
      WHERE a.address = ?`,
  ).bind(normalized).first<MailboxRecord>();
  if (exact) return exact;
  const at = normalized.indexOf("@");
  if (at < 0) return null;
  const localPart = normalized.slice(0, at);
  const canonicalLocalPart = canonicalizeLookupLocalPart(localPart);
  if (!canonicalLocalPart) return null;
  return env.DB.prepare(
    `SELECT b.id, b.owner_id, b.local_part, b.address, b.display_name,
            b.status, b.created_at, b.approved_at
       FROM mailbox_addresses a
       JOIN mailboxes b ON b.id = a.mailbox_id
      WHERE a.canonical_local_part = ?
        AND LOWER(substr(a.address, INSTR(a.address, '@') + 1)) = ?`,
  ).bind(canonicalLocalPart, normalized.slice(at + 1)).first<MailboxRecord>();
}

export async function createMailbox(
  env: MailEnv,
  input: {
    ownerId: string;
    localPart: string;
    displayName: string;
  },
): Promise<MailboxRecord> {
  const existing = await getMailboxByOwner(env, input.ownerId);
  if (existing) return existing;
  const canonicalLocalPart = canonicalizeLocalPart(input.localPart);
  const now = new Date().toISOString();
  const status = String(env.AUTO_APPROVE_SIGNUPS) === "true" ? "active" : "pending";
  const mailbox: MailboxRecord = {
    id: crypto.randomUUID(),
    owner_id: input.ownerId,
    local_part: input.localPart,
    canonical_local_part: canonicalLocalPart,
    address: `${input.localPart}@${env.MAIL_DOMAIN.toLowerCase()}`,
    display_name: input.displayName,
    status,
    created_at: now,
    approved_at: status === "active" ? now : null,
  };
  try {
    await env.DB.batch([
      env.DB.prepare(
      `INSERT INTO mailboxes
          (id, owner_id, local_part, canonical_local_part, address, display_name, status, created_at, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        mailbox.id,
        mailbox.owner_id,
        mailbox.local_part,
        mailbox.canonical_local_part,
        mailbox.address,
        mailbox.display_name,
        mailbox.status,
        mailbox.created_at,
        mailbox.approved_at,
      ),
      env.DB.prepare(
        `INSERT INTO mailbox_addresses
          (address, local_part, canonical_local_part, mailbox_id, kind, created_at)
         VALUES (?, ?, ?, ?, 'primary', ?)`,
      ).bind(mailbox.address, mailbox.local_part, mailbox.canonical_local_part, mailbox.id, now),
    ]);
  } catch (error) {
    const conflict = await getMailboxByOwner(env, input.ownerId);
    if (conflict) return conflict;
    if (String(error).toLowerCase().includes("unique")) {
      throw new ApiError(409, "mailbox_unavailable", "Mailbox name is unavailable");
    }
    throw error;
  }
  return mailbox;
}

export async function updateMailboxStatus(
  env: MailEnv,
  mailboxId: string,
  status: "active" | "suspended",
): Promise<MailboxRecord> {
  const approvedAt = status === "active" ? new Date().toISOString() : null;
  const result = await env.DB.prepare(
    `UPDATE mailboxes
        SET status = ?, approved_at = COALESCE(?, approved_at)
      WHERE id = ?
      RETURNING ${MAILBOX_COLUMNS}`,
  ).bind(status, approvedAt, mailboxId).first<MailboxRecord>();
  if (!result) {
    throw new ApiError(404, "mailbox_not_found", "Mailbox was not found");
  }
  return result;
}

export async function listMailboxAddresses(
  env: MailEnv,
  mailboxId: string,
): Promise<MailboxAddressRecord[]> {
  const result = await env.DB.prepare(
    `SELECT address, local_part, mailbox_id, kind, created_at
       FROM mailbox_addresses
      WHERE mailbox_id = ?
      ORDER BY CASE kind WHEN 'primary' THEN 0 ELSE 1 END, created_at`,
  ).bind(mailboxId).all<MailboxAddressRecord>();
  return result.results;
}

export async function addMailboxAlias(
  env: MailEnv,
  mailboxId: string,
  localPart: string,
): Promise<MailboxAddressRecord> {
  const canonicalLocalPart = canonicalizeLocalPart(localPart);
  const mailbox = await env.DB.prepare(
    "SELECT id FROM mailboxes WHERE id = ?",
  ).bind(mailboxId).first<{ id: string }>();
  if (!mailbox) {
    throw new ApiError(404, "mailbox_not_found", "Mailbox was not found");
  }
  const address = `${localPart}@${env.MAIL_DOMAIN.toLowerCase()}`;
  const existing = await env.DB.prepare(
    `SELECT address, local_part, mailbox_id, kind, created_at
       FROM mailbox_addresses WHERE address = ?`,
  ).bind(address).first<MailboxAddressRecord>();
  if (existing?.mailbox_id === mailboxId) return existing;
  const record: MailboxAddressRecord = {
    address,
    local_part: localPart,
    mailbox_id: mailboxId,
    kind: "alias",
    created_at: new Date().toISOString(),
  };
  try {
    await env.DB.prepare(
    `INSERT INTO mailbox_addresses
        (address, local_part, canonical_local_part, mailbox_id, kind, created_at)
       VALUES (?, ?, ?, ?, 'alias', ?)`,
    ).bind(address, localPart, canonicalLocalPart, mailboxId, record.created_at).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new ApiError(409, "alias_unavailable", "Email alias is unavailable");
    }
    throw error;
  }
  return record;
}
