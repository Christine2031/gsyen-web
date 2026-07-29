const path = require('node:path');
const { Worker } = require('node:worker_threads');
const {
  OFFICE_LIMITS,
  assertOfficeOutput,
  officeError,
  preflightOfficeFile,
} = require('./office-resource-policy.cjs');

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.xlsx', '.xls']);
let activeWorkers = 0;

function publicOfficeError(error) {
  const code = error?.code || 'OFFICE_PARSE_FAILED';
  if (code === 'OFFICE_FORMAT_UNSUPPORTED') return '不支持的 Office 格式。';
  if (code === 'OFFICE_WORKER_BUSY') return 'Office 预览正忙，请稍后重试。';
  if (code === 'OFFICE_PARSE_TIMEOUT') return 'Office 文档预览超时。';
  if (code.includes('LIMIT') || code === 'FILE_TOO_LARGE') {
    return 'Office 文档超出安全预览限制。';
  }
  return 'Office 文档无法安全预览。';
}

function runWorker(fileBytes, ext) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(__dirname, 'office-parser-worker.cjs'),
      {
        workerData: { fileBytes, ext, limits: OFFICE_LIMITS },
        resourceLimits: {
          maxOldGenerationSizeMb: OFFICE_LIMITS.workerHeapMb,
          maxYoungGenerationSizeMb: 32,
        },
      },
    );
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      const error = officeError('OFFICE_PARSE_TIMEOUT');
      worker.terminate().finally(() => finish(error));
    }, OFFICE_LIMITS.timeoutMs);

    worker.once('message', message => {
      if (message?.type === 'result') {
        try {
          finish(null, assertOfficeOutput(message.value));
        } catch (error) {
          finish(error);
        }
      } else {
        finish(officeError(message?.code || 'OFFICE_PARSE_FAILED'));
      }
    });
    worker.once('error', () => finish(officeError('OFFICE_PARSE_FAILED')));
    worker.once('exit', () => {
      if (!settled) finish(officeError('OFFICE_PARSE_FAILED'));
    });
  });
}

async function parseOfficeSafely(filePath, ext) {
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw officeError('OFFICE_FORMAT_UNSUPPORTED');
  }
  if (activeWorkers >= OFFICE_LIMITS.maxWorkers) {
    throw officeError('OFFICE_WORKER_BUSY');
  }
  activeWorkers += 1;
  try {
    const fileBytes = await preflightOfficeFile(filePath, ext);
    return await runWorker(fileBytes, ext);
  } finally {
    activeWorkers -= 1;
  }
}

module.exports = { parseOfficeSafely, publicOfficeError };
