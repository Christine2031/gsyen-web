import { describe, expect, it } from "vitest";
import {
  canonicalInboundAddress,
  normalizeLocalPart,
  canonicalizeLocalPart,
  parseIdempotencyKey,
  parseSendRequest,
} from "../src/validation";

describe("mailbox registration validation", () => {
  it("normalizes an available mailbox name", () => {
    expect(normalizeLocalPart(" Ethan.7586 ")).toBe("ethan.7586");
    expect(canonicalizeLocalPart(" Ethan.7586 ")).toBe("ethan7586");
  });

  it.each(["admin", "a", ".ethan", "ethan..7586", "ethan@evil.test", "ethan_spam", "ethan-spam", "a.buse"])(
    "rejects reserved or malformed mailbox name %s",
    (value) => {
      expect(() => normalizeLocalPart(value)).toThrow();
    },
  );
});

describe("outbound message validation", () => {
  it("normalizes recipients and preserves plain text", () => {
    const result = parseSendRequest({
      to: ["FRIEND@example.com"],
      cc: [],
      subject: "Hello",
      text: "Plain-text message",
    });
    expect(result.to).toEqual(["friend@example.com"]);
    expect(result.text).toBe("Plain-text message");
    expect(result.category).toBe("primary");
  });

  it.each(["primary", "social", "promotions", "updates"] as const)(
    "accepts the supported %s category",
    (category) => {
      expect(parseSendRequest({
        to: ["friend@example.com"],
        subject: "Hello",
        text: "Message",
        category,
      }).category).toBe(category);
    },
  );

  it("rejects an unsupported category", () => {
    try {
      parseSendRequest({
        to: ["friend@example.com"],
        subject: "Hello",
        text: "Message",
        category: "system",
      });
      throw new Error("Expected an invalid category error");
    } catch (error) {
      expect(error).toMatchObject({
        status: 400,
        code: "invalid_category",
        message: "Message category is invalid",
      });
    }
  });

  it("rejects non-string categories without coercion", () => {
    for (const category of [["primary"], null, 1]) {
      expect(() => parseSendRequest({
        to: ["friend@example.com"],
        subject: "Hello",
        text: "Message",
        category,
      })).toThrow(expect.objectContaining({
        status: 400,
        code: "invalid_category",
        message: "Message category is invalid",
      }));
    }
  });

  it("removes duplicate recipients across To and Cc", () => {
    const result = parseSendRequest({
      to: ["friend@example.com", "friend@example.com"],
      cc: ["friend@example.com", "other@example.com"],
      subject: "Hello",
      text: "Plain-text message",
    });
    expect(result.to).toEqual(["friend@example.com"]);
    expect(result.cc).toEqual(["other@example.com"]);
  });

  it("rejects header injection in reply metadata", () => {
    expect(() => parseSendRequest({
      to: ["friend@example.com"],
      subject: "Hello",
      text: "Message",
      inReplyTo: "<safe@example.com>\r\nBcc: attacker@example.com",
    })).toThrow();
  });

  it("accepts only RFC-shaped message identifiers for threading", () => {
    const result = parseSendRequest({
      to: ["friend@example.com"],
      subject: "Re: Hello",
      text: "Message",
      inReplyTo: "<original@example.com>",
      references: ["<root@example.com>", "<original@example.com>"],
    });
    expect(result.inReplyTo).toBe("<original@example.com>");
    expect(result.references).toEqual([
      "<root@example.com>",
      "<original@example.com>",
    ]);
    expect(() => parseSendRequest({
      to: ["friend@example.com"],
      subject: "Re: Hello",
      text: "Message",
      inReplyTo: "sha256:not-an-internet-message-id",
    })).toThrow();
  });

  it("enforces the RFC 5322 Message-ID limit of 998 characters", () => {
    const atLimit = `<${"a".repeat(991)}@x.io>`;
    const overLimit = `<${"a".repeat(992)}@x.io>`;
    expect(atLimit).toHaveLength(998);
    expect(overLimit).toHaveLength(999);
    expect(parseSendRequest({
      to: ["friend@example.com"],
      subject: "Re: Hello",
      text: "Message",
      inReplyTo: atLimit,
    }).inReplyTo).toBe(atLimit);
    expect(() => parseSendRequest({
      to: ["friend@example.com"],
      subject: "Re: Hello",
      text: "Message",
      inReplyTo: overLimit,
    })).toThrow("in_reply_to is invalid");
  });

  it("rejects more than ten recipients", () => {
    expect(() => parseSendRequest({
      to: Array.from({ length: 11 }, (_, index) => `user${index}@example.com`),
      subject: "Hello",
      text: "Message",
    })).toThrow();
  });
});

describe("send idempotency", () => {
  it("accepts a stable client key", () => {
    expect(parseIdempotencyKey("client:20260729:0123456789")).toBe(
      "client:20260729:0123456789",
    );
  });

  it.each(["", "short", "bad key with spaces"])("rejects unsafe key %s", (key) => {
    expect(() => parseIdempotencyKey(key)).toThrow();
  });
});

describe("inbound routing", () => {
  it("maps plus addressing on the primary domain", () => {
    expect(canonicalInboundAddress(
      "ethan+receipt@gsyen.com",
      "gsyen.com",
      "gsyen.com",
    )).toBe("ethan@gsyen.com");
  });

  it("maps gmail dot-insensitive inbound localpart", () => {
    expect(canonicalInboundAddress(
      "E.T.H.A.N+receipt@gsyen.com",
      "gsyen.com",
      "gsyen.com",
    )).toBe("ethan@gsyen.com");
  });

  it("keeps legacy inbound aliases outside signup validation", () => {
    expect(canonicalInboundAddress(
      "old-user_name+receipt@gsyen.com",
      "gsyen.com",
      "gsyen.com",
    )).toBe("old-user_name@gsyen.com");
  });

  it("rejects the retired mail subdomain", () => {
    expect(canonicalInboundAddress(
      "ethan@mail.gsyen.com",
      "gsyen.com",
      "gsyen.com",
    )).toBeNull();
  });

  it("rejects a recipient on another domain", () => {
    expect(canonicalInboundAddress(
      "ethan@evil.example",
      "gsyen.com",
      "gsyen.com",
    )).toBeNull();
  });
});
