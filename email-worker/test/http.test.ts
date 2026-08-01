import { describe, expect, it } from "vitest";
import { corsHeaders, readJson } from "../src/http";
import type { MailEnv } from "../src/types";

describe("bounded JSON reader", () => {
  it("rejects a streamed body that exceeds the configured limit", async () => {
    const request = new Request("https://mail.test/v1/messages/send", {
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(64) }),
    });

    await expect(readJson(request, 16)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });
});

describe("CORS policy", () => {
  it("allows authenticated permanent-delete requests from an exact origin", () => {
    const request = new Request("https://mail.test/v1/messages/id", {
      method: "OPTIONS",
      headers: { Origin: "https://gsyen.com" },
    });
    const headers = corsHeaders(request, {
      ALLOWED_ORIGINS: "https://gsyen.com",
    } as unknown as MailEnv);
    expect(headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://gsyen.com");
  });
});
