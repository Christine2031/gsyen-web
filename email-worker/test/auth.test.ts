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
    }))));
    const request = new Request("https://mail.test/v1/mailboxes/me", {
      headers: { Authorization: "Bearer valid-token" },
    });

    await expect(requireUser(request, authEnv)).resolves.toEqual({
      id: "user-2",
      email: "admin@example.com",
      isAdmin: true,
    });
  });
});
