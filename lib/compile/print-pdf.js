// Print PDF packager — takes the themed context and produces a
// press-ready 6x9 PDF using Paged.js (for CSS Paged Media pagination)
// rendered via Puppeteer (headless Chrome, prints to PDF).
//
// Story 4.1 ships this as a stub that only logs the phase. Later stories
// fill in the real pipeline:
//   4.2 → Classic Serif print theme (theme CSS with @page rules, running
//          headers, page numbers, bleed, asymmetric margins)
//   4.3 → Paged.js HTML scaffold (concatenated chapters, metadata)
//   4.4 → Puppeteer → PDF (real output)
//   4.5 → print-specific preflight checks

export async function packagePrintPdf(context) {
  if (!context.theme) {
    throw new Error('Print PDF packaging requires the theme phase to run first');
  }

  // STUB — Story 4.4 replaces this with a real Puppeteer-driven render.
  context.output = {
    path: null,
    bytes: 0,
    format: 'print-pdf',
    stub: true,
  };

  return context;
}
