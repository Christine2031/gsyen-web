import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("worker", () => {
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
});
