// Spine width calculator.
//
// Spine width = page count × per-page paper thickness.
// We round UP to the nearest 0.005" to avoid a cover that's too narrow
// to print correctly. Printers reject covers where the spine art extends
// into the bleed on the wrong side.
//
// Page count is TOTAL pages (front matter + chapters + back matter),
// NOT word count. Use preflight.estimatedPages when the rendered page
// count is unavailable.
//
// KDP paper stock reference (inches per page):
//   https://kdp.amazon.com/en_US/help/topic/G201834230

export const PAPER_STOCKS = {
  '50-white': { thicknessPerPage: 0.0022, label: '50# White' },
  '50-cream': { thicknessPerPage: 0.0025, label: '50# Cream' },
  '60-white': { thicknessPerPage: 0.0028, label: '60# White' },
  '60-cream': { thicknessPerPage: 0.0028, label: '60# Cream' },
};

export const DEFAULT_PAPER_STOCK = '50-cream';

// Minimum printable spine width (below this, the spine art won't be visible).
const MIN_SPINE_IN = 0.1;

export function calculateSpineWidth(pageCount, paperStock = DEFAULT_PAPER_STOCK) {
  const stock = PAPER_STOCKS[paperStock] ?? PAPER_STOCKS[DEFAULT_PAPER_STOCK];
  const raw = pageCount * stock.thicknessPerPage;
  // Round up to nearest 0.005"
  const rounded = Math.ceil(raw / 0.005) * 0.005;
  return Math.max(rounded, MIN_SPINE_IN);
}

// Estimate page count from word count (250 words/page is the trade standard
// for a 6×9 book at 12pt/1.5× line-height). Use for cover sizing when the
// actual PDF hasn't been rendered yet.
export function estimatePageCount(wordCount) {
  return Math.max(Math.round(wordCount / 250), 10);
}
