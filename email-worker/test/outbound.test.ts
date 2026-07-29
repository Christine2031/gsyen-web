import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  claimOutboundRecord,
  createMailbox,
  getOutboundStatus,
} from "../src/repository";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & {
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe("outbound delivery claim", () => {
  it("allows only one active claim for a queued message", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "claim-owner",
      localPart: "claim-owner",
      displayName: "Claim",
    });
    await testEnv.DB.prepare(
      "UPDATE mailboxes SET status = 'active' WHERE id = ?",
    ).bind(mailbox.id).run();
    await testEnv.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, direction, folder, from_address, to_json, cc_json,
         subject, text_body, references_json, status, created_at)
       VALUES (?, ?, 'outbound', 'outbox', ?, ?, '[]', ?, ?, '[]', 'queued', ?)`,
    ).bind(
      "claim-message",
      mailbox.id,
      mailbox.address,
      JSON.stringify(["recipient@example.com"]),
      "Claim test",
      "Body",
      new Date().toISOString(),
    ).run();

    const first = await claimOutboundRecord(testEnv, "claim-message");
    const second = await claimOutboundRecord(testEnv, "claim-message");

    expect(first?.id).toBe("claim-message");
    expect(second).toBeNull();
    expect(await getOutboundStatus(testEnv, "claim-message")).toBe("sending");
  });
});
