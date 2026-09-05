// Targeted, region-based OCR for Marketing Company / Address.
//
// A full-page OCR pass reads a dense, multi-column, icon-heavy label out
// of its intended order often enough that a genuine anchor phrase (e.g.
// "Marketed in India by:") ends up reconstructed onto the same text "line"
// as unrelated content from elsewhere on the page — a different column's
// icon graphic, or a whole unrelated sentence. Rather than trying to fully
// solve general page-layout analysis, this locates roughly where the
// anchor sits (from the full-page pass's own word positions) and re-OCRs
// just a region around it in isolation, on the theory that a small, mostly
// self-contained crop is far less likely to also contain an unrelated
// column's content than the full page is.
//
// Fully generic: the anchor phrases are the same ones
// labelFieldExtractor.service.ts already recognizes line-anchored
// ("Marketed in India by", "Manufactured for", "Distributed by", "Mfd./
// Mfg. for", etc.) — nothing here is specific to any one label, brand, or
// company name.
import sharp from 'sharp';
import { PSM } from 'tesseract.js';
import { recognizeRegion, type OcrWord, type Rectangle } from './tesseract.service';
import { MARKETING_ANCHOR_PHRASES, extractLabelFields } from './labelFieldExtractor.service';

const MAX_ANCHOR_WINDOW_WORDS = 6;

type Bbox = { x0: number; y0: number; x1: number; y1: number };

// Slides a window of up to MAX_ANCHOR_WINDOW_WORDS consecutive words (as
// the full-page pass ordered them) looking for one that reads as a
// marketing-company anchor phrase, and returns its bounding box. Tries
// window length before start position — the SHORTEST matching window
// anywhere on the page wins, not the first one found scanning
// left-to-right — because a scrambled reading order can place an
// unrelated word immediately before a genuine anchor (seen in practice:
// "...is not established. Marketed in India by:", where "not
// established." is the tail of a completely unrelated sentence); the
// longer window that happens to include it also satisfies the same regex
// as a substring, but shifts the computed bounding box off the real
// anchor's actual position. Preferring the shortest match consistently
// picks the tight phrase itself over any such accidental prefix.
function findAnchorBbox(words: OcrWord[]): Bbox | null {
  for (let len = 1; len <= MAX_ANCHOR_WINDOW_WORDS; len++) {
    for (let start = 0; start + len <= words.length; start++) {
      const windowWords = words.slice(start, start + len);
      const joined = windowWords.map((word) => word.text).join(' ');
      if (MARKETING_ANCHOR_PHRASES.test(joined)) {
        return {
          x0: Math.min(...windowWords.map((word) => word.bbox.x0)),
          y0: Math.min(...windowWords.map((word) => word.bbox.y0)),
          x1: Math.max(...windowWords.map((word) => word.bbox.x1)),
          y1: Math.max(...windowWords.map((word) => word.bbox.y1))
        };
      }
    }
  }
  return null;
}

// Builds the crop rectangle to re-OCR: starting just above/left of the
// anchor, and sized as a multiple of the anchor's OWN text height rather
// than a fraction of the page — the anchor's height already reflects this
// page's actual font size/DPI, so scaling from it generalizes across page
// sizes and resolutions far better than a page-relative fraction does. A
// page-relative width was tried first and reached well past a genuinely
// separate column of unrelated content on a wide, multi-panel label (the
// column boundary has no reliable relationship to the page's total
// width); anchoring the crop size to text height instead consistently
// stayed within the anchor's own column across both a synthetic
// single-column mockup and a real multi-panel label sheet.
const REGION_WIDTH_LINE_HEIGHT_MULTIPLE = 20;
const REGION_HEIGHT_LINE_HEIGHT_MULTIPLE = 8;

function buildRegionRectangle(anchor: Bbox, pageWidth: number, pageHeight: number): Rectangle | null {
  const lineHeight = Math.max(10, anchor.y1 - anchor.y0);
  const left = Math.max(0, Math.round(anchor.x0 - lineHeight));
  const top = Math.max(0, Math.round(anchor.y0 - lineHeight * 0.5));
  const width = Math.max(0, Math.min(pageWidth - left, Math.round(lineHeight * REGION_WIDTH_LINE_HEIGHT_MULTIPLE)));
  const height = Math.max(0, Math.min(pageHeight - top, Math.round(lineHeight * REGION_HEIGHT_LINE_HEIGHT_MULTIPLE)));

  if (width < lineHeight * 3 || height < lineHeight * 2) return null;
  return { left, top, width, height };
}

export type RegionFields = { marketingCompany: string; address: string };

// Locates a marketing-company anchor among a full-page OCR pass's word
// positions, re-OCRs a region around it with a page-segmentation mode
// suited to a small compact block of text, and parses marketing company /
// address from that focused text using the exact same confidence gates as
// the full-page pass — so this only ever returns a value it would already
// have trusted from anywhere else, never a relaxed one. Returns blank
// fields (never throws) when no anchor is found, the region can't be
// computed, or the focused OCR still doesn't yield a confident value.
export async function extractMarketingCompanyAndAddressFromRegion(pageImageBuffer: Buffer, words: OcrWord[]): Promise<RegionFields> {
  const empty: RegionFields = { marketingCompany: '', address: '' };

  const anchor = findAnchorBbox(words);
  if (!anchor) return empty;

  const metadata = await sharp(pageImageBuffer).metadata();
  const pageWidth = metadata.width ?? anchor.x1 + 1;
  const pageHeight = metadata.height ?? anchor.y1 + 1;

  const rectangle = buildRegionRectangle(anchor, pageWidth, pageHeight);
  if (!rectangle) return empty;

  const regionText = await recognizeRegion(pageImageBuffer, rectangle, PSM.SINGLE_BLOCK);
  const regionFields = extractLabelFields(regionText);
  return { marketingCompany: regionFields.marketingCompany, address: regionFields.address };
}
