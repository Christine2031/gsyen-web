import { ApiError } from "./http";
import type { MailEnv } from "./types";

function removeUnsafeMarkup(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|embed|form|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|form|base|meta|link)\b[^>]*\/?\s*>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "");
}

export function sealHtmlPreview(source: string): string {
  const content = removeUnsafeMarkup(source);
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:; base-uri 'none'; form-action 'none'">
<style>html,body{margin:0;padding:0;background:#fff;color:#1a1a1a}body{padding:20px;font:14px/1.6 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}a{color:#1a6ecc;word-break:break-all}table{max-width:100%!important}pre{white-space:pre-wrap;word-break:break-word}</style>
</head><body>${content}</body></html>`;
}

export async function getMessageHtmlPreview(
  env: MailEnv,
  mailboxId: string,
  messageId: string,
): Promise<string> {
  const stored = await env.DB.prepare(
    "SELECT html_object_key FROM messages WHERE id = ? AND mailbox_id = ?",
  ).bind(messageId, mailboxId).first<{ html_object_key: string | null }>();
  if (!stored?.html_object_key) {
    throw new ApiError(404, "html_not_available", "HTML preview is unavailable for this message");
  }
  const source = await env.MAIL_OBJECTS.get(stored.html_object_key);
  if (!source) {
    throw new ApiError(410, "html_missing", "HTML preview content is unavailable");
  }
  return sealHtmlPreview(await source.text());
}
