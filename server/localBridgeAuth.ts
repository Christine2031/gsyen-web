import { timingSafeEqual } from 'node:crypto';
import { verifyChatIdentity } from '../shared/chatAccess';

export function isValidLocalBridgeToken(
  supplied: string | string[] | undefined,
  expected = process.env.LOCAL_BRIDGE_TOKEN,
): boolean {
  if (!expected || typeof supplied !== 'string') return false;
  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireLocalBridgeToken(req: any, res: any): boolean {
  const supplied = req.headers?.['x-gsyen-bridge-token'];
  if (isValidLocalBridgeToken(supplied)) return true;
  res.status(401).json({ error: 'Local bridge authorization required', code: 'BRIDGE_AUTH_REQUIRED' });
  return false;
}

export type ChatAccessMode = 'cloud' | 'local-bridge' | 'reject';

export function resolveChatAccessMode(
  model: string,
  suppliedToken?: string | string[],
  expectedToken = process.env.LOCAL_BRIDGE_TOKEN,
): ChatAccessMode {
  if (model !== 'chatgpt-pro') return 'cloud';
  if (!expectedToken) return 'cloud';
  return isValidLocalBridgeToken(suppliedToken, expectedToken)
    ? 'local-bridge'
    : 'reject';
}

export async function requireLocalBridgeAccess(req: any, res: any): Promise<boolean> {
  const accessMode = resolveChatAccessMode(
    'chatgpt-pro',
    req.headers?.['x-gsyen-bridge-token'],
  );
  if (accessMode === 'local-bridge') return true;
  if (accessMode === 'reject') {
    return requireLocalBridgeToken(req, res);
  }
  const headers = new Headers();
  if (typeof req.headers?.authorization === 'string') {
    headers.set('Authorization', req.headers.authorization);
  }
  const identity = await verifyChatIdentity(headers);
  if (identity.ok === true) return true;
  res.status(identity.status).json({ error: identity.message, code: identity.code });
  return false;
}
