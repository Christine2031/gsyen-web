const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ quiet: true });

function cleanHttpsOrigin(raw) {
  const value = raw?.trim();
  if (!value) throw new Error('VITE_GSYEN_API_URL is required for Electron builds');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('VITE_GSYEN_API_URL must be a clean HTTPS origin');
  }
  return url.origin;
}

const target = path.join(__dirname, '..', 'electron', 'runtime-config.generated.json');
const contents = `${JSON.stringify({
  gsyenApiOrigin: cleanHttpsOrigin(process.env.VITE_GSYEN_API_URL),
}, null, 2)}\n`;

fs.writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 });
