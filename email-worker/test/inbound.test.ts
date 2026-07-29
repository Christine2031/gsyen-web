import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { receiveEmail } from "../src/inbound";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & {
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await testEnv.DB.batch([
    testEnv.DB.prepare("DELETE FROM attachments"),
    testEnv.DB.prepare("DELETE FROM messages"),
    testEnv.DB.prepare("DELETE FROM audit_events"),
    testEnv.DB.prepare("DELETE FROM send_usage"),
    testEnv.DB.prepare("DELETE FROM mailboxes"),
  ]);
});

function emailMessage(
  to: string,
  raw: string,
  onReject: (reason: string) => void,
): ForwardableEmailMessage {
  const bytes = new TextEncoder().encode(raw);
  return {
    from: "sender@example.com",
    to,
    raw: new Blob([bytes]).stream(),
    rawSize: bytes.byteLength,
    headers: new Headers(),
    setReject: onReject,
  } as unknown as ForwardableEmailMessage;
}

async function createActiveMailbox(): Promise<void> {
  const now = new Date().toISOString();
  await testEnv.DB.prepare(
    `INSERT INTO mailboxes
      (id, owner_id, local_part, address, display_name, status, created_at, approved_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(
    "mailbox-inbound",
    "user-inbound",
    "ethan",
    "ethan@gsyen.com",
    "Ethan",
    now,
    now,
  ).run();
  await testEnv.DB.prepare(
    `INSERT INTO mailbox_addresses
      (address, local_part, mailbox_id, kind, created_at)
     VALUES (?, ?, ?, 'primary', ?)`,
  ).bind("ethan@gsyen.com", "ethan", "mailbox-inbound", now).run();
}

describe("inbound email", () => {
  it("parses, stores, and deduplicates an accepted message", async () => {
    await createActiveMailbox();
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Ethan <ethan@gsyen.com>",
      "Message-ID: <message-1@example.com>",
      "Subject: Test message",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Safe plain text",
    ].join("\r\n");
    let rejection = "";
    await receiveEmail(emailMessage(
      "ethan+test@mail.gsyen.com",
      raw,
      (reason) => { rejection = reason; },
    ), testEnv);
    await receiveEmail(emailMessage(
      "ethan@gsyen.com",
      raw,
      (reason) => { rejection = reason; },
    ), testEnv);
    const result = await testEnv.DB.prepare(
      `SELECT subject, text_body, raw_object_key, envelope_from_address
         FROM messages WHERE mailbox_id = ?`,
    ).bind("mailbox-inbound").all<{
      subject: string;
      text_body: string;
      raw_object_key: string;
      envelope_from_address: string;
    }>();
    expect(rejection).toBe("");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].subject).toBe("Test message");
    expect(result.results[0].text_body).toContain("Safe plain text");
    expect(result.results[0].envelope_from_address).toBe("sender@example.com");
    expect(await testEnv.MAIL_OBJECTS.head(result.results[0].raw_object_key)).not.toBeNull();
  });

  it("rejects an unknown recipient without storing content", async () => {
    let rejection = "";
    await receiveEmail(emailMessage(
      "unknown@mail.gsyen.com",
      "From: sender@example.com\r\n\r\nHello",
      (reason) => { rejection = reason; },
    ), testEnv);
    const count = await testEnv.DB.prepare(
      "SELECT count(*) AS count FROM messages",
    ).first<{ count: number }>();
    expect(rejection).toContain("does not exist");
    expect(count?.count).toBe(0);
  });
});
