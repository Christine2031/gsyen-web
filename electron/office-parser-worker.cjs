const { isMainThread, parentPort, workerData } = require('node:worker_threads');
const { sanitizeOfficeHtml } = require('./sanitize-office-html.cjs');
const {
  assertOfficeOutput,
  officeError,
} = require('./office-resource-policy.cjs');

function assertWorkerInput(fileBytes, limits) {
  if (!Buffer.isBuffer(fileBytes) || fileBytes.length > limits.maxInputBytes) {
    throw officeError('OFFICE_INPUT_LIMIT');
  }
}

function worksheetCellCount(XLSX, sheet, limits) {
  if (!sheet?.['!ref']) return 0;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows = range.e.r - range.s.r + 1;
  const columns = range.e.c - range.s.c + 1;
  if (rows > limits.maxRowsPerSheet ||
      columns > limits.maxColumnsPerSheet) {
    throw officeError('OFFICE_WORKBOOK_LIMIT');
  }
  return rows * columns;
}

async function parseOfficeFile(input, ext, limits) {
  const fileBytes = Buffer.from(input);
  assertWorkerInput(fileBytes, limits);
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const htmlResult = await mammoth.convertToHtml({ buffer: fileBytes });
    assertOfficeOutput(htmlResult.value, limits.maxOutputBytes);
    const html = sanitizeOfficeHtml(htmlResult.value);
    const markdownResult = await mammoth.convertToMarkdown({ buffer: fileBytes });
    assertOfficeOutput(markdownResult.value, limits.maxOutputBytes);
    return assertOfficeOutput({
      ok: true,
      ext,
      html,
      markdown: markdownResult.value,
    }, limits.maxOutputBytes);
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(fileBytes, { type: 'buffer' });
    if (workbook.SheetNames.length > limits.maxSheets) {
      throw officeError('OFFICE_WORKBOOK_LIMIT');
    }
    let cells = 0;
    const sheets = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      cells += worksheetCellCount(XLSX, sheet, limits);
      if (cells > limits.maxCells) {
        throw officeError('OFFICE_WORKBOOK_LIMIT');
      }
      const html = sanitizeOfficeHtml(XLSX.utils.sheet_to_html(sheet));
      assertOfficeOutput(html, limits.maxOutputBytes);
      sheets.push({ name, html });
      assertOfficeOutput(sheets, limits.maxOutputBytes);
    }
    return assertOfficeOutput({ ok: true, ext, sheets }, limits.maxOutputBytes);
  }

  throw officeError('OFFICE_FORMAT_UNSUPPORTED');
}

if (!isMainThread) {
  parseOfficeFile(workerData.fileBytes, workerData.ext, workerData.limits)
    .then(value => parentPort.postMessage({ type: 'result', value }))
    .catch(error => parentPort.postMessage({
      type: 'error',
      code: error?.code || 'OFFICE_PARSE_FAILED',
    }));
}

module.exports = { parseOfficeFile, worksheetCellCount };
