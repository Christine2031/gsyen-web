const ALLOWED_ORIGINS = new Set([
  'https://gsyen.com',
  'https://www.gsyen.com',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'null',
]);

export function registerLocalBridgeCors(app: any) {
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-GSYEN-Bridge-Token');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}
