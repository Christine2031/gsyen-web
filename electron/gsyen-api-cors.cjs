const fs = require('node:fs');
const path = require('node:path');

const MAIL_API_HOST = 'mail-api.gsyen.com';
const MAIL_API_ORIGIN = `https://${MAIL_API_HOST}`;
const DEV_ORIGIN = 'http://127.0.0.1:5173';
const PRODUCTION_ORIGIN = 'https://gsyen.com';

function cleanHttpsOrigin(raw, name = 'GSYEN API origin') {
  const value = raw?.trim();
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(`${name} must be a clean HTTPS origin`);
  }
  return url.origin;
}

function loadGsyenApiOrigin() {
  const environmentValue = process.env.GSYEN_API_ORIGIN || process.env.VITE_GSYEN_API_URL;
  if (environmentValue) return cleanHttpsOrigin(environmentValue);

  const generatedPath = path.join(__dirname, 'runtime-config.generated.json');
  if (!fs.existsSync(generatedPath)) {
    throw new Error('Electron API config is missing; run npm run generate:electron-config');
  }
  const config = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
  return cleanHttpsOrigin(config.gsyenApiOrigin, 'generated GSYEN API origin');
}

function apiConfig(configuredOrigin = loadGsyenApiOrigin()) {
  const origins = [cleanHttpsOrigin(configuredOrigin), MAIL_API_ORIGIN];
  return {
    hosts: origins.map(origin => new URL(origin).host),
    origins: new Set(origins),
    filter: { urls: origins.map(origin => `${origin}/*`) },
  };
}

function isGsyenApiRequest(rawUrl, configuredOrigin) {
  try {
    const url = new URL(rawUrl);
    return !url.username && !url.password && apiConfig(configuredOrigin).origins.has(url.origin);
  } catch {
    return false;
  }
}

function setHeader(headers, name, value) {
  const next = { ...(headers || {}) };
  const existing = Object.keys(next).find(key => key.toLowerCase() === name.toLowerCase());
  if (existing) delete next[existing];
  next[name] = value;
  return next;
}

function registerGsyenApiCors(session, isDev, configuredOrigin) {
  const config = apiConfig(configuredOrigin);
  const trustedOrigin = configuredOrigin || loadGsyenApiOrigin();
  const trusted = rawUrl => isGsyenApiRequest(rawUrl, trustedOrigin);

  session.webRequest.onBeforeSendHeaders(config.filter, (details, callback) => {
    const requestHeaders = trusted(details.url)
      ? setHeader(details.requestHeaders, 'Origin', PRODUCTION_ORIGIN)
      : details.requestHeaders;
    callback({ requestHeaders });
  });

  if (!isDev) return;
  session.webRequest.onHeadersReceived(config.filter, (details, callback) => {
    if (!trusted(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    let responseHeaders = setHeader(
      details.responseHeaders,
      'Access-Control-Allow-Origin',
      [DEV_ORIGIN],
    );
    responseHeaders = setHeader(
      responseHeaders,
      'Access-Control-Allow-Credentials',
      ['true'],
    );
    callback({ responseHeaders });
  });
}

module.exports = {
  DEV_ORIGIN,
  MAIL_API_HOST,
  PRODUCTION_ORIGIN,
  apiConfig,
  cleanHttpsOrigin,
  isGsyenApiRequest,
  loadGsyenApiOrigin,
  registerGsyenApiCors,
  setHeader,
};
