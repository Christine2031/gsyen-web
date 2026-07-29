const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const XLSX = require('xlsx');
const {
  OFFICE_LIMITS,
  assertOfficeOutput,
  inspectZipContainer,
  preflightOfficeFile,
} = require('./office-resource-policy.cjs');
const { parseOfficeSafely } = require('./office-parser-runner.cjs');

function benignWorkbook() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['name', 'value'], ['GSYEN', 56]]),
    'Sheet1',
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('Office preflight accepts a small valid workbook and records ZIP bounds', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-office-preflight-'));
  const file = path.join(temp, 'safe.xlsx');
  const bytes = benignWorkbook();
  fs.writeFileSync(file, bytes);

  try {
    const receipt = inspectZipContainer(bytes);
    assert.equal(receipt.entries > 0, true);
    assert.equal(receipt.expandedBytes > 0, true);
    await preflightOfficeFile(file, '.xlsx');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('ZIP metadata limits reject excessive entry cardinality without inflation', () => {
  const bytes = benignWorkbook();
  assert.throws(
    () => inspectZipContainer(bytes, {
      ...OFFICE_LIMITS,
      maxArchiveEntries: 0,
    }),
    error => error.code === 'OFFICE_ARCHIVE_LIMIT',
  );
});

test('Office output accounting rejects over-limit decoded results', () => {
  assert.throws(
    () => assertOfficeOutput({ html: '123456' }, 5),
    error => error.code === 'OFFICE_OUTPUT_LIMIT',
  );
});

test('bounded worker preserves benign workbook parsing', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsyen-office-worker-'));
  const file = path.join(temp, 'safe.xlsx');
  fs.writeFileSync(file, benignWorkbook());

  try {
    const result = await parseOfficeSafely(file, '.xlsx');
    assert.equal(result.ok, true);
    assert.equal(result.sheets.length, 1);
    assert.match(result.sheets[0].html, /GSYEN/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
