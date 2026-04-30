// Kobo EPUB profile.
//
// Kobo readers and the Kobo app are generally CSS-capable. The main
// quirk is that Kobo's default user stylesheet applies a slightly looser
// line-height and larger base font than Apple Books, which interacts
// badly with our carefully set leading. We counter this with explicit
// declarations that win the specificity battle.
//
// Kobo also has a known issue where it ignores `text-align: justify`
// on the body element in some firmware versions — we set it on <p>
// directly as well to cover both code paths.

export const id = 'kobo';
export const label = 'Kobo';
export const format = 'epub';
export const filenameSuffix = 'kobo';

const KOBO_CSS_OVERRIDES = `
/* ── Kobo compatibility overrides ───────────────────────────────── */

/* Kobo's user stylesheet bumps line-height; pin ours explicitly */
p, li, blockquote {
  line-height: inherit !important;
}

/* Ensure justification applies even when Kobo ignores body-level rule */
p {
  text-align: justify;
}

/* Kobo sometimes re-applies serif font over our embedded face — re-assert */
body {
  font-family: var(--nw-body-font, serif) !important;
}
`;

export function applyProfileCss() {
  return KOBO_CSS_OVERRIDES;
}

export function applyProfileMetadata(metadata) {
  return metadata;
}
