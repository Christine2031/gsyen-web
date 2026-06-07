import { ChatMessage } from '../types/chat';

/** Download an AI message as a styled HTML quote card */
export function exportQuoteCard(msg: ChatMessage, lang: 'zh' | 'en'): void {
  const title    = lang === 'zh' ? 'Atelier 灵感记录' : 'Atelier Curated Log';
  const metadata = `TIME: ${msg.timestamp} | ASSISTANT VER. 2.5`;

  const html = `
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body {
        background-color: #F9F8F6;
        color: #1A1A1A;
        font-family: 'Playfair Display', Georgia, serif;
        padding: 40px;
        max-width: 600px;
        margin: 40px auto;
        border: 1px solid #1A1A1A;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      }
      h1 { font-size: 18px; border-bottom: 1px solid rgba(26,26,26,0.1); padding-bottom: 10px; text-transform: uppercase; letter-spacing: 0.1em; }
      .meta { font-family: monospace; font-size: 9px; color: rgba(26,26,26,0.5); margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.15em; }
      .content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #2F2F2F; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <div class="meta">${metadata}</div>
    <div class="content">${msg.content}</div>
  </body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `atelier-inspiration-${msg.id}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
