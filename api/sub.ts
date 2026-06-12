import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const token = (req.query.t ?? '') as string;

  const validTokens = (process.env.MAAS_TOKENS ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  if (!token || !validTokens.includes(token)) {
    return res.status(401).json({ error: 'invalid token' });
  }

  const nodes = process.env.MAAS_NODES ?? '';
  if (!nodes) {
    return res.status(503).json({ error: 'no nodes configured' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(nodes);
}
