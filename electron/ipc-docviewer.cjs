/**
 * ipc-docviewer — mammoth (.docx) + SheetJS (.xlsx) 解析
 * docviewer:parseOffice(filePath) → DocResult | XlsxResult | ErrResult
 */
const path = require('path');
const fs   = require('fs');

module.exports = function registerDocViewerHandlers(ipcMain) {

  ipcMain.handle('docviewer:parseOffice', async (_e, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    try {
      if (ext === '.docx') {
        const mammoth = require('mammoth');
        const [htmlRes, mdRes] = await Promise.all([
          mammoth.convertToHtml({ path: filePath }),
          mammoth.convertToMarkdown({ path: filePath }),
        ]);
        return { ok: true, ext, html: htmlRes.value, markdown: mdRes.value };
      }

      if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = require('xlsx');
        const buf  = fs.readFileSync(filePath);
        const wb   = XLSX.read(buf, { type: 'buffer' });
        const sheets = wb.SheetNames.map(name => ({
          name,
          html: XLSX.utils.sheet_to_html(wb.Sheets[name]),
        }));
        return { ok: true, ext, sheets };
      }

      return { ok: false, error: `不支持的格式：${ext}` };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
};
