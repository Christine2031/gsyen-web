import { describe, expect, it } from "vitest";
import { readJson } from "../src/http";

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
