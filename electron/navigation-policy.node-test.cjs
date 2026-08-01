const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { isAllowedNavigation, isExternalHttpUrl } = require('./navigation-policy.cjs');

test('production navigation stays inside the packaged renderer directory', () => {
  const renderer = path.resolve('fixtures', 'resources', 'app', 'dist');
  assert.equal(
    isAllowedNavigation(pathToFileURL(path.join(renderer, 'index.html')).href, false, renderer),
    true,
  );
  assert.equal(
    isAllowedNavigation(pathToFileURL(path.resolve('fixtures', 'secret.txt')).href, false, renderer),
    false,
  );
  assert.equal(
    isAllowedNavigation(pathToFileURL(`${renderer}-other\\index.html`).href, false, renderer),
    false,
  );
});

test('development navigation only accepts the configured loopback Vite origin', () => {
  assert.equal(isAllowedNavigation('http://127.0.0.1:5173/chat', true, 'unused'), true);
  assert.equal(isAllowedNavigation('http://localhost:5173/chat', true, 'unused'), false);
  assert.equal(isAllowedNavigation('https://127.0.0.1:5173/chat', true, 'unused'), false);
});

test('external links only permit HTTP(S) protocols', () => {
  assert.equal(isExternalHttpUrl('https://example.com/verify'), true);
  assert.equal(isExternalHttpUrl('http://example.com/verify'), true);
  assert.equal(isExternalHttpUrl('mailto:test@example.com'), false);
  assert.equal(isExternalHttpUrl('file:///C:/secret.txt'), false);
  assert.equal(isExternalHttpUrl('javascript:alert(1)'), false);
});
