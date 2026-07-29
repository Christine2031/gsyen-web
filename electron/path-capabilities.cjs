const fs = require('fs');
const path = require('path');

function canonicalPath(candidate) {
  let cursor = path.resolve(String(candidate ?? ''));
  const tail = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    tail.unshift(path.basename(cursor));
    cursor = parent;
  }
  const realBase = fs.existsSync(cursor) ? fs.realpathSync.native(cursor) : cursor;
  return path.resolve(realBase, ...tail);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function uniqueCanonical(values) {
  return [...new Set(values.filter(value => typeof value === 'string').map(canonicalPath))];
}

class PathCapabilities {
  constructor(stateFile) {
    this.stateFile = stateFile;
    const saved = this.load();
    this.directories = saved.directories;
    this.files = saved.files;
  }

  load() {
    try {
      const value = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      if (value?.version !== 2) return { directories: [], files: [] };
      return {
        directories: uniqueCanonical(Array.isArray(value.directories) ? value.directories : []),
        files: uniqueCanonical(Array.isArray(value.files) ? value.files : []),
      };
    } catch {
      return { directories: [], files: [] };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify({
      version: 2,
      directories: this.directories,
      files: this.files,
    }, null, 2), { mode: 0o600 });
  }

  grantDirectories(directories) {
    for (const directory of directories) {
      const canonical = canonicalPath(directory);
      if (!path.isAbsolute(canonical) || !fs.existsSync(canonical)) continue;
      if (!fs.statSync(canonical).isDirectory()) continue;
      if (!this.directories.includes(canonical)) this.directories.push(canonical);
    }
    this.save();
  }

  grantFiles(files) {
    for (const file of files) {
      const canonical = canonicalPath(file);
      if (!path.isAbsolute(canonical) || !fs.existsSync(canonical)) continue;
      if (!fs.statSync(canonical).isFile()) continue;
      if (!this.files.includes(canonical)) this.files.push(canonical);
    }
    this.save();
  }

  grantDialogSelection(filePaths) {
    const directories = [];
    const files = [];
    for (const candidate of filePaths) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isDirectory()) directories.push(candidate);
        else if (stat.isFile()) files.push(candidate);
      } catch {
        // A selection that vanished before authorization is ignored.
      }
    }
    if (directories.length) this.grantDirectories(directories);
    if (files.length) this.grantFiles(files);
  }

  isDirectoryAllowed(candidate) {
    const canonical = canonicalPath(candidate);
    return this.directories.some(root => isWithin(root, canonical));
  }

  listAllowedFiles(directory) {
    const canonical = canonicalPath(directory);
    if (this.isDirectoryAllowed(canonical)) return null;
    const files = this.files.filter(file => path.dirname(file) === canonical);
    if (files.length === 0) {
      throw new Error('Path is not authorized. Re-add it through the Library picker.');
    }
    return files;
  }

  requireListableDirectory(candidate) {
    if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) {
      throw new Error('Path is not authorized: an absolute path is required.');
    }
    const canonical = canonicalPath(candidate);
    this.listAllowedFiles(canonical);
    if (!fs.existsSync(canonical) || !fs.statSync(canonical).isDirectory()) {
      throw new Error('Path is not authorized: an existing directory is required.');
    }
    return canonical;
  }

  requireAllowed(candidate) {
    if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) {
      throw new Error('Path is not authorized: an absolute path is required.');
    }
    const canonical = canonicalPath(candidate);
    const allowed = this.files.includes(canonical) ||
      this.directories.some(root => isWithin(root, canonical));
    if (!allowed) {
      throw new Error('Path is not authorized. Re-add it through the Library picker.');
    }
    return canonical;
  }

  resolveRenameTarget(source, candidate) {
    const canonicalSource = this.requireAllowed(source);
    const canonicalTarget = canonicalPath(candidate);
    if (fs.existsSync(canonicalTarget)) {
      return this.requireAllowed(canonicalTarget);
    }
    try {
      return this.requireAllowed(canonicalTarget);
    } catch {
      const sourceIsRoot = this.files.includes(canonicalSource) ||
        this.directories.includes(canonicalSource);
      if (!sourceIsRoot || path.dirname(canonicalSource) !== path.dirname(canonicalTarget)) {
        throw new Error('Rename target is not authorized.');
      }
      return canonicalTarget;
    }
  }

  commitRename(source, target) {
    const canonicalSource = canonicalPath(source);
    const canonicalTarget = canonicalPath(target);
    this.files = this.files.map(file => file === canonicalSource ? canonicalTarget : file);
    this.directories = this.directories.map(directory =>
      directory === canonicalSource ? canonicalTarget : directory
    );
    this.save();
  }
}

let singleton;
function getPathCapabilities(app) {
  if (!singleton) {
    singleton = new PathCapabilities(path.join(app.getPath('userData'), 'approved-library-paths.json'));
  }
  return singleton;
}

module.exports = { PathCapabilities, getPathCapabilities };
