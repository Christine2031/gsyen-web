import { describe, expect, it } from 'vitest';
import {
  MAX_PDF_IMAGE_PIXELS,
  MAX_PDF_VIEWPORT_DIMENSION,
  MAX_PDF_VIEWPORT_PIXELS,
  checkedPdfViewportSize,
  pdfDocumentOptions,
} from './pdfSecurity';

describe('pdfDocumentOptions', () => {
  it('keeps both PDF entry points on the same fail-closed loading policy', () => {
    const data = new Uint8Array([1, 2, 3]);

    expect(pdfDocumentOptions(data)).toEqual({
      data,
      enableXfa: false,
      maxImageSize: MAX_PDF_IMAGE_PIXELS,
      stopAtErrors: true,
    });
  });

  it('rounds a normal viewport before allocating a canvas', () => {
    expect(checkedPdfViewportSize({ width: 612.1, height: 792.1 })).toEqual({
      width: 613,
      height: 793,
    });
  });

  it('rejects hostile MediaBox dimensions before canvas allocation', () => {
    expect(() => checkedPdfViewportSize({ width: 200_000, height: 200_000 })).toThrow('PDF_PAGE_TOO_LARGE');
    expect(() => checkedPdfViewportSize({ width: MAX_PDF_VIEWPORT_DIMENSION + 1, height: 1 })).toThrow('PDF_PAGE_TOO_LARGE');
    expect(() => checkedPdfViewportSize({ width: MAX_PDF_VIEWPORT_PIXELS, height: 2 })).toThrow('PDF_PAGE_TOO_LARGE');
    expect(() => checkedPdfViewportSize({ width: Number.POSITIVE_INFINITY, height: 1 })).toThrow('PDF_PAGE_TOO_LARGE');
  });
});
