// Apple Books EPUB profile.
//
// Apple Books is the most capable EPUB reader — full CSS3, embedded fonts,
// SVG, OpenType features, drop caps, running headers via CSS. Our base
// compile output is already Apple-optimised, so this profile is effectively
// a no-op that exists to make the target system explicit.
//
// Apple-specific OPF metadata (epub:type="cover", apple-media-type) is
// handled by the @lesjoursfr/html-to-epub library's EPUB 3 output.

export const id = 'apple';
export const label = 'Apple Books';
export const format = 'epub';
export const filenameSuffix = 'apple';

export function applyProfileCss() {
  return '';  // base CSS is already Apple-optimal
}

export function applyProfileMetadata(metadata) {
  return metadata;  // no overrides needed
}
