const assert = require('node:assert/strict');
const test = require('node:test');
const configuredToken = process.env.LOCAL_BRIDGE_TOKEN;
delete process.env.LOCAL_BRIDGE_TOKEN;
const { getLocalBridgeConfig, getLocalBridgeToken } = require('./local-server.cjs');
if (configuredToken !== undefined) process.env.LOCAL_BRIDGE_TOKEN = configuredToken;

test('local bridge token is process-local, stable, and high entropy', () => {
  const first = getLocalBridgeToken();
  const second = getLocalBridgeToken();

  assert.equal(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
});

test('development bridge config binds the capability to an explicit loopback base', async () => {
  const config = await getLocalBridgeConfig();
  assert.equal(config.base, 'http://127.0.0.1:3000');
  assert.equal(config.token, getLocalBridgeToken());
});

test('packaged startup uses an OS-assigned port announced over child IPC', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'local-server.cjs'),
    'utf8',
  );
  assert.match(source, /PORT: '0'/);
  assert.match(source, /stdio: \['ignore', 'ignore', 'ignore', 'ipc'\]/);
  assert.match(source, /message\?\.type !== 'gsyen-api-ready'/);
  assert.doesNotMatch(source, /if \(await isReady\(\)\)/);
});
