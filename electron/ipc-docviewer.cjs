/**
 * ipc-docviewer — mammoth (.docx) + SheetJS (.xlsx) 解析
 * docviewer:parseOffice(filePath) → DocResult | XlsxResult | ErrResult
 */
const { app } = require('electron');
const path = require('path');
const { getPathCapabilities } = require('./path-capabilities.cjs');
const {
  parseOfficeSafely,
  publicOfficeError,
} = require('./office-parser-runner.cjs');

module.exports = function registerDocViewerHandlers(ipcMain) {

  ipcMain.handle('docviewer:parseOffice', async (_e, filePath) => {
    try {
      const approvedPath = getPathCapabilities(app).requireAllowed(filePath);
      const ext = path.extname(approvedPath).toLowerCase();
      if (ext === '.docx' || ext === '.xlsx' || ext === '.xls') {
        return await parseOfficeSafely(approvedPath, ext);
      }

      return { ok: false, error: `不支持的格式：${ext}` };
    } catch (e) {
      return { ok: false, error: publicOfficeError(e) };
    }
  });
};
