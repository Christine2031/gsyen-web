const fs = require('node:fs');

const DEFAULT_LIMITS = Object.freeze({
  maxTextBytes: 8 * 1024 * 1024,
  maxBinaryBytes: 32 * 1024 * 1024,
  maxActiveBytes: 48 * 1024 * 1024,
  maxActiveJobs: 2,
});

function resourceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function positiveLimit(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function createBoundedReader(options = {}) {
  const limits = {
    maxTextBytes: positiveLimit(options.maxTextBytes, DEFAULT_LIMITS.maxTextBytes),
    maxBinaryBytes: positiveLimit(options.maxBinaryBytes, DEFAULT_LIMITS.maxBinaryBytes),
    maxActiveBytes: positiveLimit(options.maxActiveBytes, DEFAULT_LIMITS.maxActiveBytes),
    maxActiveJobs: positiveLimit(options.maxActiveJobs, DEFAULT_LIMITS.maxActiveJobs),
  };
  let activeBytes = 0;
  let activeJobs = 0;

  async function readBuffer(filePath, maxBytes) {
    const byteLimit = positiveLimit(maxBytes, limits.maxBinaryBytes);
    const handle = await fs.promises.open(filePath, 'r');
    let reservedBytes = 0;
    let reservationHeld = false;
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw resourceError('NOT_A_FILE');
      if (!Number.isSafeInteger(stat.size) || stat.size > byteLimit) {
        throw resourceError('FILE_TOO_LARGE');
      }
      if (activeJobs >= limits.maxActiveJobs ||
          activeBytes + stat.size > limits.maxActiveBytes) {
        throw resourceError('READ_BUDGET_BUSY');
      }
      activeJobs += 1;
      activeBytes += stat.size;
      reservedBytes = stat.size;
      reservationHeld = true;

      const output = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < output.length) {
        const { bytesRead } = await handle.read(
          output,
          offset,
          output.length - offset,
          offset,
        );
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      return output.subarray(0, offset);
    } finally {
      if (reservationHeld) {
        activeBytes -= reservedBytes;
        activeJobs -= 1;
      }
      await handle.close();
    }
  }

  async function readText(filePath) {
    const data = await readBuffer(filePath, limits.maxTextBytes);
    return data.toString('utf8');
  }

  async function readBase64(filePath) {
    const data = await readBuffer(filePath, limits.maxBinaryBytes);
    const encodedLength = 4 * Math.ceil(data.length / 3);
    const maxEncodedLength = 4 * Math.ceil(limits.maxBinaryBytes / 3);
    if (encodedLength > maxEncodedLength) {
      throw resourceError('ENCODED_RESULT_TOO_LARGE');
    }
    return data.toString('base64');
  }

  return { limits, readBuffer, readText, readBase64 };
}

const defaultReader = createBoundedReader();

module.exports = {
  DEFAULT_LIMITS,
  createBoundedReader,
  readFileBufferBounded: defaultReader.readBuffer,
  readFileTextBounded: defaultReader.readText,
  readFileBase64Bounded: defaultReader.readBase64,
};
