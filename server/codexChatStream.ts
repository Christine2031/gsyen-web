import type { Request, Response } from 'express';
import { streamCodexAppServer } from './codexAppServer';
import { runCodexBridge, type CodexBridgeInput } from './codexBridge';
import { hasImageAttachments } from '../shared/providerMessages';

const FIRST_DELTA_TIMEOUT_MS = Number(process.env.CODEX_FIRST_DELTA_TIMEOUT_MS || 12_000);
const KEEP_ALIVE_MS = 5_000;

function writeSse(res: Response, content: string) {
  if (res.destroyed || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}

function writeKeepAlive(res: Response) {
  if (res.destroyed || res.writableEnded) return;
  res.write(': gsyen-chatgpt-bridge-waiting\n\n');
}

function canFallback(message = ''): boolean {
  return /APP SERVER|CODEX SESSION|NOT READY|UNAVAILABLE|WS ERROR|WS TIMEOUT|FIRST DELTA/i.test(message);
}

export function bindClientDisconnect(
  req: Pick<Request, 'aborted' | 'once' | 'removeListener'>,
  res: Pick<Response, 'destroyed' | 'writableEnded' | 'once' | 'removeListener'>,
  onDisconnect: () => void,
): () => void {
  let active = true;
  const disconnect = () => {
    if (!active) return;
    active = false;
    onDisconnect();
  };
  const onResponseClose = () => {
    if (!res.writableEnded) disconnect();
  };

  req.once('aborted', disconnect);
  res.once('close', onResponseClose);
  if (req.aborted || res.destroyed) disconnect();

  return () => {
    active = false;
    req.removeListener('aborted', disconnect);
    res.removeListener('close', onResponseClose);
  };
}

export async function streamCodexChatResponse(req: Request, res: Response, input: CodexBridgeInput) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const appController = new AbortController();
  let finished = false;
  let wroteAny = false;
  let clientClosed = false;
  const hasImages = hasImageAttachments(input.messages);
  const keepAlive = setInterval(() => writeKeepAlive(res), KEEP_ALIVE_MS);
  const firstDeltaTimer = setTimeout(() => {
    if (!wroteAny && !finished && !clientClosed) {
      appController.abort(new Error('APP SERVER FIRST DELTA TIMEOUT'));
    }
  }, FIRST_DELTA_TIMEOUT_MS);

  const unbindClientDisconnect = bindClientDisconnect(req, res, () => {
    clientClosed = true;
    if (!finished) appController.abort(new Error('CLIENT CLOSED'));
  });

  try {
    const text = await streamCodexAppServer(input, delta => {
      wroteAny = true;
      clearTimeout(firstDeltaTimer);
      writeSse(res, delta);
    }, { signal: appController.signal });
    const unsentText = unsentCompletionText(text, wroteAny);
    if (unsentText) writeSse(res, unsentText);
  } catch (err: any) {
    console.error('Codex app-server stream failed:', err);
    if (!clientClosed && !wroteAny && !hasImages && canFallback(err?.message)) {
      try {
        const text = await runCodexBridge({ ...input, timeoutMs: 45_000 });
        writeSse(res, text);
      } catch (fallbackErr: any) {
        writeSse(res, `CHATGPT 本地桥接暂时不可用：${fallbackErr?.message || err?.message || 'UNKNOWN ERROR'}`);
      }
    } else if (!clientClosed && !wroteAny) {
      writeSse(res, `CHATGPT 本地常驻桥接失败：${err?.message || 'UNKNOWN ERROR'}`);
    }
  } finally {
    clearInterval(keepAlive);
    clearTimeout(firstDeltaTimer);
    finished = true;
    unbindClientDisconnect();
    if (!res.destroyed && !res.writableEnded) res.end('data: [DONE]\n\n');
  }
}

export function unsentCompletionText(text: string, wroteAny: boolean): string | null {
  if (wroteAny) return null;
  return text.trim() || '我在，但这次没有生成有效回复。';
}
