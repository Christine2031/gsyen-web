import { afterEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "../src/auth";
import type { MailEnv } from "../src/types";

const authEnv = {
  AUTH_API_URL: "https://auth.test",
  SUPABASE_ANON_KEY: "test-anon-key",
} as unknown as MailEnv;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mail identity", () => {
  it("requires a verified Supabase email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "user-1",
      email: "user@example.com",
      email_confirmed_at: null,
      app_metadata: {},
    }))));
    const request = new Request("https://mail.test/v1/mailboxes/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    await expect(requireUser(request, authEnv)).rejects.toMatchObject({
      status: 403,
      code: "email_unverified",
    });
  });

  it("preserves the mail admin claim for a verified user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "user-2",
      email: "ADMIN@EXAMPLE.COM",
        email_confirmed_at: "2026-07-29T00:00:00.000Z",
        app_metadata: { mail_admin: true },
        user_metadata: { gsyen_username: "Ethan.7586" },
      }))));
    const request = new Request("https://mail.test/v1/mailboxes/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    await expect(requireUser(request, authEnv)).resolves.toEqual({
      id: "user-2",
      email: "admin@example.com",
      isAdmin: true,
      userMetadata: { gsyen_username: "Ethan.7586" },
    });
  });

  it("reuses x-mail-request-id in auth failure logs", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = new Request("https://mail.test/v1/mailboxes/me", {
      headers: { "x-mail-request-id": "diag-2026", Authorization: "bad-token" },
    });

    await expect(requireUser(request, authEnv)).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });

    const lastLog = warning.mock.calls.at(-1)?.[0];
    expect(lastLog).toBeDefined();
    const payload = JSON.parse(String(lastLog));
    expect(payload.event).toBe("mail_auth_failed");
    expect(payload.requestId).toBe("diag-2026");
    expect(payload.stage).toBe("auth_missing_or_oversized_bearer");
    expect(payload.path).toBe("/v1/mailboxes/me");
  });
});


