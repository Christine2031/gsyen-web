const API_HOST = 'gsyen-api-776196228503.asia-east1.run.app';
const MAIL_API_HOST = 'mail-api.gsyen.com';
const DEV_ORIGIN = 'http://127.0.0.1:5173';
const PRODUCTION_ORIGIN = 'https://gsyen.com';
const API_HOSTS = [API_HOST, MAIL_API_HOST];
const API_ORIGINS = new Set(API_HOSTS.map(host => `https://${host}`));
const API_FILTER = { urls: API_HOSTS.map(host => `https://${host}/*`) };

function isGsyenApiRequest(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return !url.username && !url.password && API_ORIGINS.has(url.origin);
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

function registerGsyenApiCors(session, isDev) {
  session.webRequest.onBeforeSendHeaders(API_FILTER, (details, callback) => {
    const requestHeaders = isGsyenApiRequest(details.url)
      ? setHeader(details.requestHeaders, 'Origin', PRODUCTION_ORIGIN)
      : details.requestHeaders;
    callback({ requestHeaders });
  });

  if (!isDev) return;
  session.webRequest.onHeadersReceived(API_FILTER, (details, callback) => {
    if (!isGsyenApiRequest(details.url)) {
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
  API_HOST,
  API_HOSTS,
  DEV_ORIGIN,
  MAIL_API_HOST,
  PRODUCTION_ORIGIN,
  isGsyenApiRequest,
  registerGsyenApiCors,
  setHeader,
};
