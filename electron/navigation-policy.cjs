const path = require('node:path');
const { fileURLToPath } = require('node:url');

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isAllowedNavigation(url, isDev, rendererDirectory) {
  try {
    const parsed = new URL(url);
    if (isDev) {
      return parsed.protocol === 'http:' &&
        parsed.hostname === '127.0.0.1' &&
        parsed.port === '5173';
    }
    if (parsed.protocol !== 'file:') return false;
    return isWithin(
      path.resolve(rendererDirectory),
      path.resolve(fileURLToPath(parsed)),
    );
  } catch {
    return false;
  }
}

function isExternalHttpUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = { isAllowedNavigation, isExternalHttpUrl };
