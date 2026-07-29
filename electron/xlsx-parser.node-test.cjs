const assert = require('node:assert/strict');
const test = require('node:test');
const XLSX = require('xlsx');

function versionAtLeast(actual, expected) {
  const left = actual.split('.').map(Number);
  const right = expected.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta > 0;
  }
  return true;
}

test('Electron document parser uses an advisory-safe SheetJS release', () => {
  assert.equal(versionAtLeast(XLSX.version, '0.20.2'), true, XLSX.version);
});

test('the upgraded parser preserves benign workbook parsing', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['name', 'value'], ['GSYEN', 56]]),
    'Sheet1',
  );
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(bytes, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(parsed.Sheets.Sheet1, { header: 1 });

  assert.deepEqual(rows, [['name', 'value'], ['GSYEN', 56]]);
});
