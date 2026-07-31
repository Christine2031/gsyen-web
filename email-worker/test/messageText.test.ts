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
});
