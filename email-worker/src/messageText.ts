import type { Email } from "postal-mime";

const MAX_TEXT_BODY_LENGTH = 250_000;

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized in named) return named[normalized];
    const numeric = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : normalized.startsWith("#") ? Number.parseInt(normalized.slice(1), 10) : NaN;
    return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
      ? String.fromCodePoint(numeric)
      : entity;
  });
}
function linkText(_match: string, quoted: string | undefined, singleQuoted: string | undefined, bare: string | undefined, label: string): string {
  const href = decodeEntities(quoted ?? singleQuoted ?? bare ?? '').trim();
  return /^https?:\/\//i.test(href) ? `${label} (${href})` : label;
}


export function plainTextFromHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi, linkText)
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(address|article|blockquote|div|fieldset|footer|h[1-6]|header|li|main|p|pre|section|table|tr|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_BODY_LENGTH);
}

export function readableMessageText(parsed: Pick<Email, "text" | "html">): string {
  const text = parsed.text?.trim();
  return (text || (parsed.html ? plainTextFromHtml(parsed.html) : ""))
    .slice(0, MAX_TEXT_BODY_LENGTH);
}
