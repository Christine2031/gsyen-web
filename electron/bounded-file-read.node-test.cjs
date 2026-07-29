const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createBoundedReader } = require('./bounded-file-read.cjs');

test('bounded reader accepts exact-limit text and binary inputs', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-bounded-read-'));
  const file = path.join(temp, 'exact.bin');
  fs.writeFileSync(file, Buffer.from('123456'));

  try {
    const reader = createBoundedReader({
      maxTextBytes: 6,
      maxBinaryBytes: 6,
      maxActiveBytes: 12,
      maxActiveJobs: 2,
    });
    assert.equal(await reader.readText(file), '123456');
    assert.equal(await reader.readBase64(file), Buffer.from('123456').toString('base64'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('bounded reader rejects one byte over before returning content', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-bounded-read-over-'));
  const file = path.join(temp, 'over.bin');
  fs.writeFileSync(file, Buffer.from('1234567'));

  try {
    const reader = createBoundedReader({
      maxTextBytes: 6,
      maxBinaryBytes: 6,
      maxActiveBytes: 12,
      maxActiveJobs: 2,
    });
    await assert.rejects(reader.readText(file), error => error.code === 'FILE_TOO_LARGE');
    await assert.rejects(reader.readBase64(file), error => error.code === 'FILE_TOO_LARGE');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('bounded reader rejects directories as file inputs', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-bounded-read-dir-'));
  try {
    const reader = createBoundedReader();
    await assert.rejects(reader.readText(temp), error => error.code === 'NOT_A_FILE');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('zero-byte reads release their concurrency reservation', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-bounded-read-empty-'));
  const empty = path.join(temp, 'empty.txt');
  const next = path.join(temp, 'next.txt');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(next, 'ok');

  try {
    const reader = createBoundedReader({
      maxTextBytes: 2,
      maxBinaryBytes: 2,
      maxActiveBytes: 2,
      maxActiveJobs: 1,
    });
    assert.equal(await reader.readText(empty), '');
    assert.equal(await reader.readText(next), 'ok');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
