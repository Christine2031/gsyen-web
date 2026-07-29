const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { renamePathNoReplace } = require('./safe-rename.cjs');

test('safe file rename preserves content without replacing an existing target', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-safe-rename-'));
  const source = path.join(temp, 'source.txt');
  const target = path.join(temp, 'target.txt');
  fs.writeFileSync(source, 'source-content');
  fs.writeFileSync(target, 'target-content');

  try {
    assert.throws(
      () => renamePathNoReplace(source, target),
      error => error.code === 'EEXIST',
    );
    assert.equal(fs.readFileSync(source, 'utf8'), 'source-content');
    assert.equal(fs.readFileSync(target, 'utf8'), 'target-content');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('safe file rename moves a granted file to a fresh sibling name', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-safe-rename-ok-'));
  const source = path.join(temp, 'source.txt');
  const target = path.join(temp, 'target.txt');
  fs.writeFileSync(source, 'content');

  try {
    renamePathNoReplace(source, target);
    assert.equal(fs.existsSync(source), false);
    assert.equal(fs.readFileSync(target, 'utf8'), 'content');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('safe file rename falls back to exclusive copy when hard links are unavailable', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-safe-rename-fallback-'));
  const source = path.join(temp, 'source.txt');
  const target = path.join(temp, 'target.txt');
  fs.writeFileSync(source, 'content');
  const unsupported = Object.assign(new Error('hard links unavailable'), { code: 'EPERM' });
  t.mock.method(fs, 'linkSync', () => { throw unsupported; });

  try {
    renamePathNoReplace(source, target);
    assert.equal(fs.existsSync(source), false);
    assert.equal(fs.readFileSync(target, 'utf8'), 'content');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
