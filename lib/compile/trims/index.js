// Print trim registry. Each entry maps a trim id to its CSS file,
// human-readable name, and dimensions (used in the filename slug).
//
// Trim CSS files are loaded BEFORE the active theme's theme-print-pdf.css
// in print-pdf.js. Trim owns @page size + margins; theme owns running
// header typography and chapter typography.

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const TRIMS = {
  '6x9': {
    id: '6x9',
    label: 'Trade Paperback (6×9)',
    description: 'Standard novel trim — supported by KDP and IngramSpark',
    cssFile: '6x9.css',
    fileSlug: '6x9',
  },
  '7x10': {
    id: '7x10',
    label: 'Academic / Textbook (7×10)',
    description: 'Scholarly textbook standard — wider measure for figures and tables',
    cssFile: '7x10.css',
    fileSlug: '7x10',
  },
  '8x10': {
    id: '8x10',
    label: 'Picture Book — Portrait (8×10)',
    description: 'Conservative picture-book trim — KDP + IngramSpark',
    cssFile: '8x10.css',
    fileSlug: '8x10',
  },
  '8.5x8.5': {
    id: '8.5x8.5',
    label: 'Picture Book — Square (8.5×8.5)',
    description: 'Iconic square picture-book trim',
    cssFile: '8.5x8.5.css',
    fileSlug: '8.5x8.5',
  },
};

export const DEFAULT_TRIM = '6x9';

export function resolveTrimCssPath(trimId) {
  const trim = TRIMS[trimId];
  if (!trim) {
    throw new Error(`Unknown trim "${trimId}". Supported: ${Object.keys(TRIMS).join(', ')}.`);
  }
  return resolve(HERE, trim.cssFile);
}

export function isValidTrim(trimId) {
  return Object.prototype.hasOwnProperty.call(TRIMS, trimId);
}
