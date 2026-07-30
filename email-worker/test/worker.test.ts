import { SELF, applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { routeRequest } from "../src/routes";

const testEnv = env as unknown as {
  DB: NonNullable<(typeof env)["DB"]>;
  TEST_MIGRATIONS: D1Migration[];
};

describe("worker", () => {
  const internalToken = "dev-internal-token";

  beforeEach(async () => {
    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports health without exposing credentials", async () => {
    const response = await SELF.fetch("https://mail.test/health");
    expect(response.status).toBe(200);
    const body = await response.json<{
      ok: boolean;
      service: string;
      domain: string;
    }>();
    expect(body).toEqual({
      ok: true,
      service: "gsyen-mail",
      domain: "gsyen.com",
    });
    expect(JSON.stringify(body)).not.toContain("SUPABASE");
  });

  it("does not allow unrecognized routes without authentication", async () => {
    const response = await SELF.fetch("https://mail.test/v1/messages");
    expect(response.status).toBe(401);
  });

  it("protects internal mailbox register endpoint with token", async () => {
    const response = await SELF.fetch("https://mail.test/v1/internal/mailboxes/register", {
      method: "POST",
      body: JSON.stringify({
        ownerId: randomUUID(),
        localPart: "guardeduser",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(401);
  });

  it("registers mailbox by owner from internal API and rejects Gmail dot collisions", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const register = async (ownerId: string, localPart: string) => SELF.fetch(
      "https://mail.test/v1/internal/mailboxes/register",
      {
        method: "POST",
        body: JSON.stringify({ ownerId, localPart, displayName: "Internal API" }),
        headers: {
          "Content-Type": "application/json",
          "x-mail-internal-token": internalToken,
        },
      },
    );
    const firstResponse = await register(ownerA, "ethan.smith");
    expect(firstResponse.status).toBe(201);
    const firstPayload = await firstResponse.json<{
      mailbox?: { id?: string; local_part?: string; address?: string };
    }>();
    expect(firstPayload.mailbox?.address).toBe("ethan.smith@gsyen.com");
    expect((firstPayload.mailbox as { status?: string } | undefined)?.status).toBe("active");

    const collisionResponse = await register(ownerB, "ethansmith");
    expect(collisionResponse.status).toBe(409);
    const collisionPayload = await collisionResponse.json();
    expect(collisionPayload).toMatchObject({ error: "mailbox_unavailable" });

    const sameOwner = await register(ownerA, "ethan");
    const samePayload = await sameOwner.json<{
      mailbox?: { address?: string; owner_id?: string };
    }>();
    expect(sameOwner.status).toBe(201);
    expect(samePayload.mailbox?.address).toBe("ethan.smith@gsyen.com");
  });

  it("self-provisions an active mailbox for a verified legacy user", async () => {
    const ownerId = randomUUID();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: ownerId,
      email: "legacy@example.com",
      email_confirmed_at: "2026-07-31T00:00:00.000Z",
      app_metadata: {},
      user_metadata: { gsyen_username: "Ethan.7586" },
    }))));
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    const request = new Request("https://mail.test/v1/mailboxes/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    const response = await routeRequest(request, env as never, ctx);
    const payload = await response.json<{
      mailbox?: { address?: string; status?: string; owner_id?: string };
    }>();

    expect(response.status).toBe(200);
    expect(payload.mailbox).toMatchObject({
      address: "ethan.7586@gsyen.com",
      owner_id: ownerId,
      status: "active",
    });
  });

  it("self-provisions legacy users with unsafe email local parts safely", async () => {
    const ownerId = randomUUID();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: ownerId,
      email: "legacy-user_name+tag@example.com",
      email_confirmed_at: "2026-07-31T00:00:00.000Z",
      app_metadata: {},
      user_metadata: {},
    }))));
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    const request = new Request("https://mail.test/v1/mailboxes/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    const response = await routeRequest(request, env as never, ctx);
    const payload = await response.json<{
      mailbox?: { address?: string; status?: string; owner_id?: string };
    }>();

    expect(response.status).toBe(200);
    expect(payload.mailbox).toMatchObject({
      address: "legacy.user.name@gsyen.com",
      owner_id: ownerId,
      status: "active",
    });
  });

  it("handles concurrent canonical collisions safely", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const ownerC = randomUUID();
    const concurrent = await Promise.all(
      [
        { ownerId: ownerA, localPart: "a.lice" },
        { ownerId: ownerB, localPart: "alice" },
        { ownerId: ownerC, localPart: "a.l.i.c.e" },
      ].map(({ ownerId, localPart }) => SELF.fetch(
        "https://mail.test/v1/internal/mailboxes/register",
        {
          method: "POST",
          body: JSON.stringify({ ownerId, localPart, displayName: "Concurrent" }),
          headers: {
            "Content-Type": "application/json",
            "x-mail-internal-token": internalToken,
          },
        },
      )),
    );
    const createdCount = concurrent.filter((response) => response.status === 201).length;
    const conflictCount = concurrent.filter((response) => response.status === 409).length;
    expect(createdCount).toBe(1);
    expect(conflictCount).toBe(2);
    const created = await concurrent.find((response) => response.status === 201)!.json<{ mailbox?: { address?: string } }>();
    expect(created.mailbox?.address).toMatch(/@gsyen\.com$/);
    expect(created.mailbox?.address?.replace(/@.*$/, "")).toMatch(/^(a\.lice|alice|a\.l\.i\.c\.e)$/);
  });

  it("revokes an internal mailbox and marks it suspended", async () => {
    const owner = randomUUID();
    const register = await SELF.fetch("https://mail.test/v1/internal/mailboxes/register", {
      method: "POST",
      body: JSON.stringify({
        ownerId: owner,
        localPart: "revokeme",
        displayName: "To Revoke",
      }),
      headers: {
        "Content-Type": "application/json",
        "x-mail-internal-token": internalToken,
      },
    });
    expect(register.status).toBe(201);

    const revoke = await SELF.fetch("https://mail.test/v1/internal/mailboxes/revoke", {
      method: "POST",
      body: JSON.stringify({ ownerId: owner, reason: "testsuite" }),
      headers: {
        "Content-Type": "application/json",
        "x-mail-internal-token": internalToken,
      },
    });
    expect(revoke.status).toBe(200);
    const revokePayload = await revoke.json<{ mailbox?: { status?: string } }>();
    expect(revokePayload.mailbox?.status).toBe("suspended");
  });
});
