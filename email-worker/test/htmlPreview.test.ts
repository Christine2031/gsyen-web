import { describe, expect, it } from "vitest";
import { sealHtmlPreview } from "../src/htmlPreview";

describe("sealHtmlPreview", () => {
  it("keeps only HTTP(S) links and marks them for an external window", () => {
    const preview = sealHtmlPreview(
      '<a class="button" href="https://claude.ai/magic-link?token=abc" onclick="alert(1)">Sign in</a><a href="javascript:alert(1)">Ignore</a>',
    );

    expect(preview).toContain('class="button"');
    expect(preview).toContain('href="https://claude.ai/magic-link?token=abc"');
    expect(preview).toContain('target="_blank"');
    expect(preview).toContain('rel="noopener noreferrer"');
    expect(preview).not.toContain("onclick");
    expect(preview).not.toContain("javascript:");
  });
});
