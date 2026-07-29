import {
  applyD1Migrations,
  env,
  type D1Migration,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addMailboxAlias,
  createMailbox,
  getMailboxByAddress,
  listMailboxAddresses,
} from "../src/repository";
import type { MailEnv } from "../src/types";

type TestEnv = MailEnv & {
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;

beforeEach(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe("mailbox aliases", () => {
  it("maps a unique alias to the same mailbox", async () => {
    const mailbox = await createMailbox(testEnv, {
      ownerId: "alias-owner",
      localPart: "ethan7586",
      displayName: "Ethan",
    });
    const alias = await addMailboxAlias(testEnv, mailbox.id, "hello");
    const resolved = await getMailboxByAddress(testEnv, "hello@gsyen.com");
    const addresses = await listMailboxAddresses(testEnv, mailbox.id);

    expect(alias.kind).toBe("alias");
    expect(resolved?.id).toBe(mailbox.id);
    expect(addresses.map((item) => item.address)).toEqual([
      "ethan7586@gsyen.com",
      "hello@gsyen.com",
    ]);
  });

  it("does not let another mailbox claim an existing alias", async () => {
    const first = await createMailbox(testEnv, {
      ownerId: "alias-owner-1",
      localPart: "first-owner",
      displayName: "First",
    });
    const second = await createMailbox(testEnv, {
      ownerId: "alias-owner-2",
      localPart: "second-owner",
      displayName: "Second",
    });
    await addMailboxAlias(testEnv, first.id, "shared-name");

    await expect(
      addMailboxAlias(testEnv, second.id, "shared-name"),
    ).rejects.toMatchObject({ status: 409, code: "alias_unavailable" });
  });
});
