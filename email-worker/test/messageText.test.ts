import { describe, expect, it } from "vitest";
import { plainTextFromHtml } from "../src/messageText";

describe("plainTextFromHtml", () => {
  it("keeps readable content while excluding executable and styling markup", () => {
    const text = plainTextFromHtml(
      "<html><head><style>.hidden { display:none }</style><script>alert(1)</script></head><body><h1>Your secure link</h1><p>Open &amp; review it.</p></body></html>",
    );
    expect(text).toContain("Your secure link");
    expect(text).toContain("Open & review it.");
    expect(text).not.toContain("display:none");
    expect(text).not.toContain("alert(1)");
  });

  it("keeps HTTPS magic links while rejecting unsafe link schemes", () => {
    const text = plainTextFromHtml(
      '<p><a href="https://claude.ai/login?token=abc">Sign in</a> <a href="javascript:alert(1)">Ignore</a></p>',
    );
    expect(text).toContain('Sign in (https://claude.ai/login?token=abc)');
    expect(text).toContain('Ignore');
    expect(text).not.toContain('javascript:');
  });
});
