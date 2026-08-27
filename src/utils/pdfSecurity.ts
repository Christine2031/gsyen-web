import type { getDocument } from 'pdfjs-dist';

type DocumentInitParameters = NonNullable<Parameters<typeof getDocument>[0]>;

// A decoded RGBA canvas needs roughly four bytes per pixel. Keep a single
// embedded image below ~100 MiB and reject malformed PDFs instead of asking
// PDF.js to recover and continue rendering attacker-controlled content.
export const MAX_PDF_IMAGE_PIXELS = 25_000_000;

// Canvas allocation is controlled by a page's MediaBox, not by the embedded
// image limit above. Keep both the total RGBA allocation and either dimension
// below conservative cross-platform browser limits before touching a canvas.
export const MAX_PDF_VIEWPORT_PIXELS = 16_000_000;
export const MAX_PDF_VIEWPORT_DIMENSION = 16_384;

export type PdfViewportSize = { width: number; height: number };

export function checkedPdfViewportSize(viewport: PdfViewportSize): PdfViewportSize {
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const pixels = width * height;

  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_PDF_VIEWPORT_DIMENSION ||
    height > MAX_PDF_VIEWPORT_DIMENSION ||
    !Number.isSafeInteger(pixels) ||
    pixels > MAX_PDF_VIEWPORT_PIXELS
  ) {
    throw new Error('PDF_PAGE_TOO_LARGE');
  }

  return { width, height };
}

export function pdfDocumentOptions(data: Uint8Array): DocumentInitParameters {
  return {
    data,
    enableXfa: false,
    maxImageSize: MAX_PDF_IMAGE_PIXELS,
    stopAtErrors: true,
  };
}
