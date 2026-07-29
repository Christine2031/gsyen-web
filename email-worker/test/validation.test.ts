import { describe, expect, it } from "vitest";
import {
  canonicalInboundAddress,
  normalizeLocalPart,
  parseIdempotencyKey,
  parseSendRequest,
} from "../src/validation";

describe("mailbox registration validation", () => {
  it("normalizes an available mailbox name", () => {
    expect(normalizeLocalPart(" Ethan.7586 ")).toBe("ethan.7586");
  });

  it.each(["admin", "a", ".ethan", "ethan..7586", "ethan@evil.test"])(
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
  it("maps plus addressing on the test subdomain to the primary domain", () => {
    expect(canonicalInboundAddress(
      "ethan+receipt@mail.gsyen.com",
      "gsyen.com",
      "gsyen.com,mail.gsyen.com",
    )).toBe("ethan@gsyen.com");
  });

  it("rejects a recipient on another domain", () => {
    expect(canonicalInboundAddress(
      "ethan@evil.example",
      "gsyen.com",
      "gsyen.com,mail.gsyen.com",
    )).toBeNull();
  });
});
