const fs = require('node:fs');

function renameFileNoReplace(source, target) {
  try {
    fs.linkSync(source, target);
  } catch (error) {
    if (error?.code === 'EEXIST') throw error;
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
  try {
    fs.unlinkSync(source);
  } catch (error) {
    try {
      fs.unlinkSync(target);
    } catch {
      // Preserve the original unlink error; cleanup is best-effort.
    }
    throw error;
  }
}

function renamePathNoReplace(source, target) {
  const stat = fs.statSync(source);
  if (stat.isFile()) {
    renameFileNoReplace(source, target);
    return;
  }
  if (fs.existsSync(target)) {
    const error = new Error('Rename target already exists.');
    error.code = 'EEXIST';
    throw error;
  }
  fs.renameSync(source, target);
}

module.exports = { renamePathNoReplace };
