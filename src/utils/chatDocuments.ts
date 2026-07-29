import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import type { ChatDocumentAttachment, ChatDocumentChunk, ChatDocumentKind, ChatDocumentSource } from '../types/chat';

export const MAX_CHAT_DOCUMENTS = 4;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 120;
const MAX_EXTRACTED_CHARS = 240_000;
const CHUNK_SIZE = 1_100;
const CHUNK_OVERLAP = 120;

export const DOCUMENT_ACCEPT = '.pdf,.docx,.xlsx,.xls,.md,.txt,.csv';
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'xls', 'md', 'txt', 'csv']);

type DocumentSection = { location: string; text: string };

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

export function isDocumentFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return DOCUMENT_EXTENSIONS.has(extension);
}

export function documentAttachmentMeta(source: ChatDocumentSource): ChatDocumentAttachment {
  const { chunks: _chunks, ...attachment } = source;
  return attachment;
}

export async function documentFileToSource(file: File): Promise<ChatDocumentSource> {
  if (!isDocumentFile(file)) throw new Error('UNSUPPORTED_DOCUMENT');
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('DOCUMENT_TOO_LARGE');

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const { sections, pageCount, sheetCount } = await extractDocumentSections(file, extension);
  const chunks = buildChunks(sections);
  const extractedChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const status = extractedChars === 0 ? 'empty' : extractedChars >= MAX_EXTRACTED_CHARS ? 'partial' : 'ready';

  return {
    id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'document', name: file.name || 'untitled-document', mimeType: file.type || mimeFor(extension),
    documentKind: documentKind(extension), status, size: file.size, extractedChars, pageCount, sheetCount, chunks,
  };
}

async function extractDocumentSections(file: File, extension: string): Promise<{
  sections: DocumentSection[]; pageCount?: number; sheetCount?: number;
}> {
  if (extension === 'pdf') return extractPdf(file);
  if (extension === 'docx') return extractDocx(file);
  if (extension === 'xlsx' || extension === 'xls') return extractSpreadsheet(file);
  return { sections: [{ location: extension === 'csv' ? 'CSV' : '文本文档', text: await file.text() }] };
}

async function extractDocx(file: File) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { sections: [{ location: 'Word 文档', text: result.value }] };
}

async function extractSpreadsheet(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return {
    sheetCount: workbook.SheetNames.length,
    sections: workbook.SheetNames.map(name => ({
      location: `工作表：${name}`,
      text: XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false }),
    })),
  };
}

async function extractPdf(file: File) {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const pageCount = pdf.numPages;
    const count = Math.min(pageCount, MAX_PDF_PAGES);
    const sections: DocumentSection[] = [];
    for (let pageNo = 1; pageNo <= count; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items.map(item => ('str' in item ? item.str : '')).join(' ');
      sections.push({ location: `第 ${pageNo} 页`, text });
    }
    return { sections, pageCount };
  } finally {
    await task.destroy();
  }
}

function buildChunks(sections: DocumentSection[]): ChatDocumentChunk[] {
  const chunks: ChatDocumentChunk[] = [];
  let remaining = MAX_EXTRACTED_CHARS;
  for (const section of sections) {
    const text = normalizeText(section.text).slice(0, remaining);
    remaining -= text.length;
    for (let start = 0; text && start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push({ id: `chunk-${chunks.length + 1}`, location: section.location, text: text.slice(start, start + CHUNK_SIZE) });
    }
    if (remaining <= 0) break;
  }
  return chunks;
}

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function documentKind(extension: string): ChatDocumentKind {
  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx') return 'word';
  if (extension === 'xlsx' || extension === 'xls') return 'spreadsheet';
  return 'text';
}

function mimeFor(extension: string): string {
  return ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    csv: 'text/csv', md: 'text/markdown', txt: 'text/plain' } as Record<string, string>)[extension] ?? 'application/octet-stream';
}
