export function resolveServerGsyenApiOrigin(configured = process.env.GSYEN_API_ORIGIN): string {
  const value = configured?.trim();
  if (!value) throw new Error('GSYEN_API_ORIGIN is required');

  const url = new URL(value);
  const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('GSYEN_API_ORIGIN must use HTTPS outside local development');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('GSYEN_API_ORIGIN must be an origin without credentials, query, or hash');
  }
  return url.origin;
}
