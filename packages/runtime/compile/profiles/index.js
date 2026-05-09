// Profile registry — maps distribution target IDs to their profile modules.
//
// EPUB targets: apple, kindle, kobo, google
// Print targets: kdp-paperback, ingramspark-paperback
//
// Print targets don't have CSS profiles; their differences are handled by
// the cover generator (bleed dimensions) and the distribution manifest.

import * as apple  from './apple.js';
import * as kindle from './kindle.js';
import * as kobo   from './kobo.js';
import * as google from './google.js';

export const EPUB_PROFILES = { apple, kindle, kobo, google };

export const PRINT_TARGETS = new Set(['kdp-paperback', 'ingramspark-paperback', 'digital-pdf']);

export const EPUB_TARGETS = new Set(Object.keys(EPUB_PROFILES));

// Bleed settings per print target (inches)
export const PRINT_BLEED = {
  'kdp-paperback':         { interior: 0,     cover: 0.125 },
  'ingramspark-paperback': { interior: 0.125, cover: 0.125 },
  'digital-pdf':           { interior: 0,     cover: 0     },
};

export const DEFAULT_TARGETS = ['apple', 'kindle', 'kdp-paperback'];

export function resolveTargets(config) {
  const raw = config?.distribution?.targets;
  if (Array.isArray(raw) && raw.length > 0) return raw;
  return DEFAULT_TARGETS;
}

export function isEpubTarget(target) {
  return EPUB_TARGETS.has(target);
}

export function isPrintTarget(target) {
  return PRINT_TARGETS.has(target);
}

export function getEpubProfile(target) {
  return EPUB_PROFILES[target] ?? EPUB_PROFILES.apple;
}

export function getPrintBleed(target) {
  return PRINT_BLEED[target] ?? PRINT_BLEED['kdp-paperback'];
}
