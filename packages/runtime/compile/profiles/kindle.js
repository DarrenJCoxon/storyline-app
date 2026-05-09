// Kindle EPUB profile.
//
// Amazon's KFX converter (used for Kindle devices since 2016) and the
// older MOBI/KF8 pipeline both mangle certain CSS features. This profile
// appends a CSS override block that neutralises the problematic rules so
// the output renders acceptably on all Kindle devices and Kindle apps.
//
// Features stripped / overridden:
//   - float on ::first-letter (KFX resets floats mid-reflow on older devices)
//   - font-feature-settings (not supported — will be ignored, but included
//     for correctness so KFX doesn't emit a conversion warning)
//   - hanging-punctuation (unsupported, emits warning)
//   - @page content / string-set (KFX ignores and Kindle provides own headers)
//   - CSS custom properties with complex values (some older devices fail)
//
// The override block is appended LAST so it wins over the Book Style CSS.

export const id = 'kindle';
export const label = 'Kindle';
export const format = 'epub';
export const filenameSuffix = 'kindle';

const KINDLE_CSS_OVERRIDES = `
/* ── Kindle compatibility overrides ─────────────────────────────── */

/* Drop caps: KFX resets floats unexpectedly — flatten to plain text */
p.first::first-letter {
  float: none;
  font-size: inherit;
  line-height: inherit;
  font-style: inherit;
  font-weight: inherit;
  margin: 0;
  padding: 0;
}

/* OpenType features: suppress the declarations that trigger KFX warnings */
p, p.first, p.first::first-line, h1, h2, h3 {
  font-feature-settings: normal;
  font-variant: normal;
  hanging-punctuation: none;
}

/* Small-caps fallback: use font-weight + letter-spacing instead */
.chapter-number,
.toc-chapter-number,
.epigraph-attribution,
.letter-header {
  font-variant: normal;
  font-feature-settings: normal;
  letter-spacing: 0.08em;
  font-size: 0.85em;
}

/* Running headers: Kindle provides its own — suppress @page content rules */
@page { content: none; string-set: none; }
`;

export function applyProfileCss() {
  return KINDLE_CSS_OVERRIDES;
}

export function applyProfileMetadata(metadata) {
  return metadata;
}
