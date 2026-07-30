import { describe, expect, it, vi } from "vitest";
import {
  getResendInternetMessageId,
  MailProviderError,
  sendWithResend,
  type ResendMessage,
} from "../src/providers/resend";
import type { MailEnv } from "../src/types";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const env = {
  RESEND_API_KEY: "test-secret",
} as MailEnv;

const message: ResendMessage = {
  id: "message-123",
  fromAddress: "ethan7586@gsyen.com",
  displayName: "Ethan",
  to: ["recipient@example.com"],
  cc: [],
  replyTo: "ethan7586@gsyen.com",
  subject: "Hello",
  text: "Test body",
  headers: { "X-GSYEN-Message-ID": "message-123" },
};

describe("Resend provider", () => {
  it("sends a bounded request with a stable idempotency key", async () => {
    const fetcher = vi.fn<Fetcher>(async () => Response.json({ id: "provider-123" }));
    const result = await sendWithResend(env, message, fetcher);
    expect(result.messageId).toBe("provider-123");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-secret",
      "Idempotency-Key": "gsyen-message-123",
      "User-Agent": "gsyen-mail-worker/0.1",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: "\"Ethan\" <ethan7586@gsyen.com>",
      to: ["recipient@example.com"],
      reply_to: "ethan7586@gsyen.com",
      subject: "Hello",
    });
  });

  it("marks validation failures as permanent without leaking provider text", async () => {
    const fetcher = vi.fn<Fetcher>(async () => Response.json(
      { name: "validation_error", message: "sensitive provider detail" },
      { status: 422 },
    ));
    const action = sendWithResend(env, message, fetcher);
    await expect(action).rejects.toMatchObject({
      code: "resend_validation_error",
      permanent: true,
    });
  });

  it("honors bounded retry guidance for rate limits", async () => {
    const fetcher = vi.fn<Fetcher>(async () => Response.json(
      { name: "rate_limit_exceeded", message: "slow down" },
      { status: 429, headers: { "Retry-After": "12" } },
    ));
    try {
      await sendWithResend(env, message, fetcher);
      throw new Error("Expected provider failure");
    } catch (error) {
      expect(error).toBeInstanceOf(MailProviderError);
      expect(error).toMatchObject({
        code: "resend_rate_limit_exceeded",
        permanent: false,
        retryAfterSeconds: 12,
      });
    }
  });

  it("retrieves and validates the RFC Message-ID for a sent email", async () => {
    const fetcher = vi.fn<Fetcher>(async () => Response.json({
      id: "provider-123",
      message_id: "<provider-123@resend.example>",
    }));
    await expect(getResendInternetMessageId(env, "provider-123", fetcher))
      .resolves.toBe("<provider-123@resend.example>");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails/provider-123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("treats unavailable or malformed sent Message-IDs as best effort", async () => {
    const unavailable = vi.fn<Fetcher>(async () => {
      throw new Error("temporary network failure");
    });
    const malformed = vi.fn<Fetcher>(async () => Response.json({
      id: "provider-123",
      message_id: "not-an-rfc-message-id",
    }));
    await expect(getResendInternetMessageId(env, "provider-123", unavailable))
      .resolves.toBeNull();
    await expect(getResendInternetMessageId(env, "provider-123", malformed))
      .resolves.toBeNull();
  });
});
