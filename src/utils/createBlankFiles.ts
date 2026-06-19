/**
 * createBlankFiles — 生成空白 xlsx / docx 的 Uint8Array（无额外依赖）
 * xlsx: SheetJS book_new  docx: 纯 JS 构造最小 OOXML ZIP（STORE，不压缩）
 */
import * as XLSX from 'xlsx';

// ── CRC-32 ───────────────────────────────────────────────────────────────────
let _crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    _crcTable[i] = c;
  }
  return _crcTable;
}
function crc32(b: Uint8Array): number {
  const t = getCrcTable(); let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── Write little-endian ints ──────────────────────────────────────────────────
function w16(b: Uint8Array, o: number, v: number) { b[o] = v & 0xFF; b[o+1] = (v >> 8) & 0xFF; }
function w32(b: Uint8Array, o: number, v: number) {
  b[o] = v & 0xFF; b[o+1] = (v >> 8) & 0xFF; b[o+2] = (v >> 16) & 0xFF; b[o+3] = (v >> 24) & 0xFF;
}

// ── Minimal PKZIP (STORE / no compression) ───────────────────────────────────
type ZipEntry = { name: string; data: Uint8Array };
function makeZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  type Meta = { offset: number; crc: number; size: number; nb: Uint8Array };
  const metas: Meta[] = [];
  const chunks: Uint8Array[] = [];
  let pos = 0;

  for (const e of entries) {
    const nb = enc.encode(e.name);
    const crc = crc32(e.data); const sz = e.data.length;
    const lh = new Uint8Array(30 + nb.length);
    lh[0]=0x50;lh[1]=0x4B;lh[2]=0x03;lh[3]=0x04;
    w16(lh,4,20); w32(lh,14,crc); w32(lh,18,sz); w32(lh,22,sz); w16(lh,26,nb.length);
    lh.set(nb, 30);
    metas.push({ offset: pos, crc, size: sz, nb });
    chunks.push(lh, e.data);
    pos += lh.length + sz;
  }

  const cdStart = pos;
  for (let i = 0; i < entries.length; i++) {
    const { offset, crc, size, nb } = metas[i];
    const cd = new Uint8Array(46 + nb.length);
    cd[0]=0x50;cd[1]=0x4B;cd[2]=0x01;cd[3]=0x02;
    w16(cd,4,20); w16(cd,6,20); w32(cd,16,crc); w32(cd,20,size); w32(cd,24,size);
    w16(cd,28,nb.length); w32(cd,42,offset); cd.set(nb, 46);
    chunks.push(cd); pos += cd.length;
  }

  const cdSize = pos - cdStart;
  const eocd = new Uint8Array(22);
  eocd[0]=0x50;eocd[1]=0x4B;eocd[2]=0x05;eocd[3]=0x06;
  w16(eocd,8,entries.length); w16(eocd,10,entries.length);
  w32(eocd,12,cdSize); w32(eocd,16,cdStart);
  chunks.push(eocd);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function createBlankXlsx(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

const CT  = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const REL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t></w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr></w:body></w:document>';
const WRL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

export function createBlankDocx(): Uint8Array {
  const e = new TextEncoder();
  return makeZip([
    { name: '[Content_Types].xml',           data: e.encode(CT)  },
    { name: '_rels/.rels',                   data: e.encode(REL) },
    { name: 'word/document.xml',             data: e.encode(DOC) },
    { name: 'word/_rels/document.xml.rels',  data: e.encode(WRL) },
  ]);
}

export function createBlankPdf(): Uint8Array {
  const enc = new TextEncoder();
  const hdr  = enc.encode('%PDF-1.4\n');
  const o1   = enc.encode('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');
  const o2   = enc.encode('2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n');
  const o3   = enc.encode('3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\n');
  const pad  = (n: number) => String(n).padStart(10, '0');
  const [a, b, c, d] = [hdr.length, hdr.length + o1.length, hdr.length + o1.length + o2.length, hdr.length + o1.length + o2.length + o3.length];
  const xref = enc.encode(
    `xref\n0 4\n0000000000 65535 f \n${pad(a)} 00000 n \n${pad(b)} 00000 n \n${pad(c)} 00000 n \n` +
    `trailer<</Size 4/Root 1 0 R>>\nstartxref\n${d}\n%%EOF\n`
  );
  const out = new Uint8Array(d + xref.length); let p = 0;
  for (const ch of [hdr, o1, o2, o3, xref]) { out.set(ch, p); p += ch.length; }
  return out;
}
