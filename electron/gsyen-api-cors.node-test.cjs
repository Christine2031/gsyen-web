const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEV_ORIGIN,
  MAIL_API_HOST,
  PRODUCTION_ORIGIN,
  apiConfig,
  isGsyenApiRequest,
  registerGsyenApiCors,
} = require('./gsyen-api-cors.cjs');

const API_ORIGIN = 'https://api-shadow.gsyen.example';
const API_URL = `${API_ORIGIN}/api/auth/login`;
const MAIL_API_URL = `https://${MAIL_API_HOST}/v1/messages?folder=inbox`;

function fakeSession() {
  const handlers = {};
  const filters = {};
  return {
    filters,
    handlers,
    webRequest: {
      onBeforeSendHeaders: (filter, handler) => {
        filters.before = filter;
        handlers.before = handler;
      },
      onHeadersReceived: (filter, handler) => {
        filters.received = filter;
        handlers.received = handler;
      },
    },
  };
}

function invoke(handler, details) {
  return new Promise(resolve => handler(details, resolve));
}

test('matches only the exact configured HTTPS API origins', () => {
  assert.equal(isGsyenApiRequest(API_URL, API_ORIGIN), true);
  assert.equal(isGsyenApiRequest(MAIL_API_URL, API_ORIGIN), true);
  assert.equal(isGsyenApiRequest('http://mail-api.gsyen.com/v1/messages', API_ORIGIN), false);
  assert.equal(isGsyenApiRequest('https://mail-api.gsyen.com.evil.example/v1/messages', API_ORIGIN), false);
  assert.equal(isGsyenApiRequest('https://evilmail-api.gsyen.com/v1/messages', API_ORIGIN), false);
  assert.equal(isGsyenApiRequest('https://api-shadow.gsyen.example.evil.test/auth', API_ORIGIN), false);
  assert.equal(isGsyenApiRequest('https://user@mail-api.gsyen.com/v1/messages', API_ORIGIN), false);
  assert.equal(isGsyenApiRequest('not-a-url', API_ORIGIN), false);
});

test('registers exact HTTPS filters for both GSYEN APIs', () => {
  const session = fakeSession();
  registerGsyenApiCors(session, true, API_ORIGIN);
  assert.deepEqual(session.filters.before.urls, apiConfig(API_ORIGIN).filter.urls);
  assert.deepEqual(session.filters.received, session.filters.before);
});

test('sends the production origin to the configured API', async () => {
  const session = fakeSession();
  registerGsyenApiCors(session, true, API_ORIGIN);
  const result = await invoke(session.handlers.before, {
    url: API_URL,
    requestHeaders: { Origin: DEV_ORIGIN },
  });
  assert.equal(result.requestHeaders.Origin, PRODUCTION_ORIGIN);
});

test('sends the production origin to the mail API', async () => {
  const session = fakeSession();
  registerGsyenApiCors(session, false, API_ORIGIN);
  const result = await invoke(session.handlers.before, {
    url: MAIL_API_URL,
    requestHeaders: { origin: 'file://' },
  });
  assert.equal(result.requestHeaders.Origin, PRODUCTION_ORIGIN);
  assert.equal(result.requestHeaders.origin, undefined);
});

test('does not rewrite an untrusted request', async () => {
  const session = fakeSession();
  registerGsyenApiCors(session, false, API_ORIGIN);
  const requestHeaders = { Origin: 'file://' };
  const result = await invoke(session.handlers.before, {
    url: 'https://mail-api.gsyen.com.evil.example/v1/messages',
    requestHeaders,
  });
  assert.deepEqual(result.requestHeaders, requestHeaders);
});

test('rewrites only development responses to the local renderer origin', async () => {
  const session = fakeSession();
  registerGsyenApiCors(session, true, API_ORIGIN);
  const result = await invoke(session.handlers.received, {
    url: MAIL_API_URL,
    responseHeaders: { 'access-control-allow-origin': [PRODUCTION_ORIGIN] },
  });
  assert.deepEqual(result.responseHeaders['Access-Control-Allow-Origin'], [DEV_ORIGIN]);
  assert.deepEqual(result.responseHeaders['Access-Control-Allow-Credentials'], ['true']);
});

test('does not install the response rewrite in production', () => {
  const session = fakeSession();
  registerGsyenApiCors(session, false, API_ORIGIN);
  assert.equal(session.handlers.received, undefined);
});
