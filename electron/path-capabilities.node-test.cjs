const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PathCapabilities } = require('./path-capabilities.cjs');

test('only paths below an explicitly granted directory are accepted', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-cap-'));
  const allowed = path.join(temp, 'allowed');
  const sibling = path.join(temp, 'sibling');
  fs.mkdirSync(allowed);
  fs.mkdirSync(sibling);

  try {
    const caps = new PathCapabilities(path.join(temp, 'caps.json'));
    caps.grantDirectories([allowed]);

    assert.equal(caps.requireAllowed(path.join(allowed, 'doc.md')).endsWith('doc.md'), true);
    assert.throws(() => caps.requireAllowed(path.join(sibling, 'secret.txt')), /not authorized/i);
    assert.throws(() => caps.requireAllowed(path.join(allowed, '..', 'sibling', 'secret.txt')), /not authorized/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an open-file grant does not authorize sibling files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-cap-file-'));
  const selected = path.join(temp, 'selected.txt');
  const sibling = path.join(temp, 'secret.txt');
  fs.writeFileSync(selected, 'selected');
  fs.writeFileSync(sibling, 'secret');

  try {
    const stateFile = path.join(temp, 'caps.json');
    const caps = new PathCapabilities(stateFile);
    caps.grantDialogSelection([selected], ['openFile']);

    assert.equal(caps.requireAllowed(selected), fs.realpathSync.native(selected));
    assert.throws(() => caps.requireAllowed(sibling), /not authorized/i);
    assert.deepEqual(caps.listAllowedFiles(temp), [fs.realpathSync.native(selected)]);

    const restored = new PathCapabilities(stateFile);
    assert.equal(restored.requireAllowed(selected), fs.realpathSync.native(selected));
    assert.throws(() => restored.requireAllowed(sibling), /not authorized/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('legacy ambiguous directory arrays fail closed', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-cap-legacy-'));
  const stateFile = path.join(temp, 'caps.json');
  fs.writeFileSync(stateFile, JSON.stringify([temp]));

  try {
    const caps = new PathCapabilities(stateFile);
    assert.throws(() => caps.requireAllowed(path.join(temp, 'secret.txt')), /not authorized/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('renaming an exact file grant preserves only the renamed file grant', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-cap-rename-'));
  const source = path.join(temp, 'source.txt');
  const target = path.join(temp, 'renamed.txt');
  fs.writeFileSync(source, 'content');

  try {
    const caps = new PathCapabilities(path.join(temp, 'caps.json'));
    caps.grantFiles([source]);
    const approvedTarget = caps.resolveRenameTarget(source, target);
    fs.renameSync(source, approvedTarget);
    caps.commitRename(source, approvedTarget);

    assert.equal(caps.requireAllowed(target), fs.realpathSync.native(target));
    assert.throws(() => caps.requireAllowed(path.join(temp, 'sibling.txt')), /not authorized/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an exact-file rename cannot replace an existing ungranted sibling', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-cap-rename-existing-'));
  const source = path.join(temp, 'source.txt');
  const sibling = path.join(temp, 'sibling.txt');
  fs.writeFileSync(source, 'authorized');
  fs.writeFileSync(sibling, 'preserve-me');

  try {
    const caps = new PathCapabilities(path.join(temp, 'caps.json'));
    caps.grantFiles([source]);

    assert.throws(
      () => caps.resolveRenameTarget(source, sibling),
      /not authorized/i,
    );
    assert.equal(fs.readFileSync(source, 'utf8'), 'authorized');
    assert.equal(fs.readFileSync(sibling, 'utf8'), 'preserve-me');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
