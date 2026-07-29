const fs = require('node:fs');
const { createBoundedReader } = require('./bounded-file-read.cjs');

const OFFICE_LIMITS = Object.freeze({
  maxInputBytes: 24 * 1024 * 1024,
  maxArchiveEntries: 5000,
  maxEntryBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 256 * 1024 * 1024,
  maxExpansionRatio: 200,
  maxOutputBytes: 16 * 1024 * 1024,
  maxSheets: 32,
  maxRowsPerSheet: 20_000,
  maxColumnsPerSheet: 512,
  maxCells: 500_000,
  maxWorkers: 2,
  timeoutMs: 10_000,
  workerHeapMb: 192,
});

const preflightReader = createBoundedReader({
  maxTextBytes: OFFICE_LIMITS.maxInputBytes,
  maxBinaryBytes: OFFICE_LIMITS.maxInputBytes,
  maxActiveBytes: OFFICE_LIMITS.maxInputBytes * OFFICE_LIMITS.maxWorkers,
  maxActiveJobs: OFFICE_LIMITS.maxWorkers,
});

function officeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = 22;
  const earliest = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - minimum; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw officeError('OFFICE_ARCHIVE_INVALID');
}

function inspectZipContainer(buffer, limits = OFFICE_LIMITS) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw officeError('OFFICE_ARCHIVE_INVALID');
  }
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 ||
      entries === 0xffff || centralSize === 0xffffffff ||
      centralOffset === 0xffffffff) {
    throw officeError('OFFICE_ARCHIVE_UNSUPPORTED');
  }
  if (entries > limits.maxArchiveEntries ||
      centralOffset + centralSize > buffer.length) {
    throw officeError('OFFICE_ARCHIVE_LIMIT');
  }

  let cursor = centralOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > buffer.length ||
        buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw officeError('OFFICE_ARCHIVE_INVALID');
    }
    const compressed = buffer.readUInt32LE(cursor + 20);
    const expanded = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (compressed === 0xffffffff || expanded === 0xffffffff ||
        expanded > limits.maxEntryBytes) {
      throw officeError('OFFICE_ARCHIVE_LIMIT');
    }
    expandedBytes += expanded;
    if (!Number.isSafeInteger(expandedBytes) ||
        expandedBytes > limits.maxExpandedBytes ||
        (expanded > 0 && (compressed === 0 ||
          expanded / compressed > limits.maxExpansionRatio))) {
      throw officeError('OFFICE_ARCHIVE_LIMIT');
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor > centralOffset + centralSize) {
    throw officeError('OFFICE_ARCHIVE_INVALID');
  }
  return { entries, expandedBytes };
}

function assertOfficeOutput(value, maxBytes = OFFICE_LIMITS.maxOutputBytes) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) {
    throw officeError('OFFICE_OUTPUT_LIMIT');
  }
  return value;
}

async function preflightOfficeFile(filePath, ext) {
  const buffer = await preflightReader.readBuffer(
    filePath,
    OFFICE_LIMITS.maxInputBytes,
  );
  if (ext === '.docx' || ext === '.xlsx') {
    inspectZipContainer(buffer);
  }
  return buffer;
}

module.exports = {
  OFFICE_LIMITS,
  assertOfficeOutput,
  inspectZipContainer,
  officeError,
  preflightOfficeFile,
};
