const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEV_ORIGIN,
  PRODUCTION_ORIGIN,
  isGsyenApiRequest,
  registerGsyenApiCors,
} = require('./gsyen-api-cors.cjs');

const API_URL = 'https://gsyen-api-776196228503.asia-east1.run.app/api/auth/login';

function fakeSession() {
  const handlers = {};
  return {
    handlers,
    webRequest: {
      onBeforeSendHeaders: (_filter, handler) => { handlers.before = handler; },
      onHeadersReceived: (_filter, handler) => { handlers.received = handler; },
    },
  };
}

function invoke(handler, details) {
  return new Promise(resolve => handler(details, resolve));
}

test('matches only the exact GSYEN API host', () => {
  assert.equal(isGsyenApiRequest(API_URL), true);
  assert.equal(isGsyenApiRequest('https://gsyen-api.evil.example/api/auth/login'), false);
  assert.equal(isGsyenApiRequest('not-a-url'), false);
});

test('sends the production origin to the GSYEN API', async () => {
  const session = fakeSession();
  registerGsyenApiCors(session, true);
  const result = await invoke(session.handlers.before, {
    url: API_URL,
    requestHeaders: { Origin: DEV_ORIGIN },
  });
  assert.equal(result.requestHeaders.Origin, PRODUCTION_ORIGIN);
});

test('rewrites only development responses to the local renderer origin', async () => {
  const session = fakeSession();
  registerGsyenApiCors(session, true);
  const result = await invoke(session.handlers.received, {
    url: API_URL,
    responseHeaders: { 'access-control-allow-origin': [PRODUCTION_ORIGIN] },
  });
  assert.deepEqual(result.responseHeaders['Access-Control-Allow-Origin'], [DEV_ORIGIN]);
  assert.deepEqual(result.responseHeaders['Access-Control-Allow-Credentials'], ['true']);
});

test('does not install the response rewrite in production', () => {
  const session = fakeSession();
  registerGsyenApiCors(session, false);
  assert.equal(session.handlers.received, undefined);
});
