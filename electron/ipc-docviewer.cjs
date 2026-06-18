/**
 * ipc-docviewer — LibreOffice headless 文档转 HTML
 * docviewer:convert(filePath) → { ok, htmlPath } | { ok: false, error }
 * docviewer:checkInstalled()  → { installed, path }
 */
const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const _PATHS = process.platform === 'darwin'
  ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice',
     '/opt/homebrew/bin/soffice', '/usr/local/bin/soffice', '/usr/bin/soffice']
  : process.platform === 'win32'
  ? ['C:\\Program Files\\LibreOffice\\program\\soffice.exe',
     'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe']
  : ['/usr/bin/soffice', '/usr/local/bin/soffice', '/snap/bin/soffice'];

function _findSoffice() {
  return _PATHS.find(p => { try { return fs.existsSync(p); } catch { return false; } }) ?? null;
}

const _cache = new Map(); // filePath → { htmlPath, mtime }

module.exports = function registerDocViewerHandlers(ipcMain) {

  ipcMain.handle('docviewer:checkInstalled', () => {
    const p = _findSoffice();
    return { installed: !!p, path: p };
  });

  ipcMain.handle('docviewer:convert', async (_e, filePath) => {
    try {
      const sofficePath = _findSoffice();
      if (!sofficePath) return { ok: false, error: 'LibreOffice 未安装' };

      const stat = fs.statSync(filePath);
      const hit  = _cache.get(filePath);
      if (hit && hit.mtime === stat.mtimeMs && fs.existsSync(hit.htmlPath)) {
        return { ok: true, htmlPath: hit.htmlPath };
      }

      const tmpDir  = os.tmpdir();
      const htmlPath = await new Promise((resolve, reject) => {
        execFile(sofficePath,
          ['--headless', '--convert-to', 'html:HTML', '--outdir', tmpDir, filePath],
          { timeout: 60000 },
          (err) => {
            if (err) { reject(err); return; }
            const out = path.join(tmpDir, path.basename(filePath, path.extname(filePath)) + '.html');
            if (!fs.existsSync(out)) { reject(new Error('LibreOffice 未生成 HTML 文件')); return; }
            resolve(out);
          }
        );
      });

      _cache.set(filePath, { htmlPath, mtime: stat.mtimeMs });
      return { ok: true, htmlPath };
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
};
