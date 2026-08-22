const assert = require('node:assert/strict');
const test = require('node:test');
const { acquireSingleInstanceLock } = require('./single-instance.cjs');

function fakeApp(hasLock) {
  const listeners = new Map();
  let quitCalls = 0;

  return {
    app: {
      requestSingleInstanceLock: () => hasLock,
      quit: () => { quitCalls += 1; },
      on: (event, listener) => { listeners.set(event, listener); },
    },
    listeners,
    getQuitCalls: () => quitCalls,
  };
}

test('quits a second application process when the instance lock is unavailable', () => {
  const state = fakeApp(false);
  let showCalls = 0;

  assert.equal(acquireSingleInstanceLock(state.app, () => { showCalls += 1; }), false);
  assert.equal(state.getQuitCalls(), 1);
  assert.equal(state.listeners.has('second-instance'), false);
  assert.equal(showCalls, 0);
});

test('focuses the existing window when the application is launched again', () => {
  const state = fakeApp(true);
  let showCalls = 0;

  assert.equal(acquireSingleInstanceLock(state.app, () => { showCalls += 1; }), true);
  assert.equal(state.getQuitCalls(), 0);
  assert.equal(typeof state.listeners.get('second-instance'), 'function');

  state.listeners.get('second-instance')();
  assert.equal(showCalls, 1);
});
