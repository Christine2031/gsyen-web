import type { IncomingMessage, ServerResponse } from 'node:http';

// These are the only Vercel-specific HTTP extensions used by this project.
// Keeping the structural contract local avoids shipping the entire Vercel
// builder toolchain just to import two compile-time-only types.
export interface VercelRequest extends IncomingMessage {
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
}

export interface VercelResponse extends ServerResponse {
  json(body: unknown): this;
  send(body: unknown): this;
  status(code: number): this;
}
