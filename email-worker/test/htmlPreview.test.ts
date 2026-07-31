import { describe, expect, it } from "vitest";
import { sealHtmlPreview } from "../src/htmlPreview";

describe("sealHtmlPreview", () => {
  it("keeps only HTTP(S) links and marks them for an external window", () => {
    const preview = sealHtmlPreview(
      '<a class="button" href="https://claude.ai/magic-link?mode=web&amp;token=abc" target rel onclick="alert(1)">Sign in</a><a href="javascript:alert(1)">Ignore</a>',
    );

    expect(preview).toContain('class="button"');
    expect(preview).toContain('href="https://claude.ai/magic-link?mode=web&amp;token=abc"');
    expect(preview).toContain('target="_blank"');
    expect(preview).toContain('rel="noopener noreferrer"');
    expect(preview.match(/\btarget=/g)).toHaveLength(1);
    expect(preview.match(/\brel=/g)).toHaveLength(1);
    expect(preview).not.toContain("onclick");
    expect(preview).not.toContain("javascript:");
  });
});
