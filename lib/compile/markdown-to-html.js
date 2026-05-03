// Markdown → HTML for the compile pipeline.
//
// Each chapter/front-matter/back-matter item's `body` (raw markdown) is
// rendered to clean, EPUB-safe XHTML. We deliberately disable raw HTML
// pass-through (html: false) so writers can't accidentally (or
// deliberately) embed junk that breaks EPUBCheck.
//
// Typography rules match the in-editor convention + publishing norms:
//   - Scene breaks render as <hr class="scene-break" /> (same class used
//     by the TipTap SceneBreak node — themes style them identically)
//   - Smart quotes: " " becomes curly, ' ' becomes curly
//   - Em-dashes from `---`, en-dashes from `--`, ellipsis from `...`

import MarkdownIt from 'markdown-it';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

// Load markdown-it-attrs from a vendored copy in lib/compile/vendor/ so
// it survives `vsce package --no-dependencies` (which strips
// node_modules from the VSIX even when allowlisted in .vscodeignore).
// The vendored copy is the source of truth; falls back to node_modules
// in dev (and during `npm run package` locally) so package upgrades
// take effect without re-vendoring.
const __mdAttrsHere = dirname(fileURLToPath(import.meta.url));
const __mdAttrsRequire = createRequire(import.meta.url);
function loadMarkdownItAttrs() {
  const tried = [];
  const candidates = [
    resolve(__mdAttrsHere, 'vendor', 'markdown-it-attrs', 'index.js'),
    'markdown-it-attrs',
  ];
  for (const c of candidates) {
    try { return __mdAttrsRequire(c); }
    catch (err) { tried.push(`${c} (${err.code ?? err.message})`); }
  }
  throw new Error(`markdown-it-attrs not found. Tried:\n  ${tried.join('\n  ')}`);
}
const markdownItAttrs = loadMarkdownItAttrs();

// Curly quote pairs: left-double, right-double, left-single, right-single.
// markdown-it's typographer uses these to convert straight quotes.
const CURLY_QUOTES = '\u201c\u201d\u2018\u2019';

function createRenderer() {
  const md = new MarkdownIt({
    html: true,        // required so ResizableImage's <img width="..."> HTML output renders instead of being escaped as text
    breaks: false,     // \n stays as \n inside <p>, not <br>
    linkify: false,    // we don't turn bare URLs into links in prose
    typographer: true, // smart quotes, en/em dashes, ellipsis
    quotes: CURLY_QUOTES,
    xhtmlOut: true,    // EPUB requires self-closed void elements
  });

  // Our convention: every horizontal rule is a scene break. Matches the
  // TipTap SceneBreak node's <hr class="scene-break"> output so themes
  // style both consistently.
  md.renderer.rules.hr = () => '<hr class="scene-break" />\n';

  // Allow `{.class-name}` attributes on inline images and other tokens so
  // picture-book authors can mark images as full-bleed and pin them to a
  // page side. Restricted to `class` only — no inline style, no id — so
  // a malicious manuscript can't smuggle JS event handlers or CSS that
  // breaks EPUBCheck.
  md.use(markdownItAttrs, {
    allowedAttributes: ['class'],
    leftDelimiter: '{',
    rightDelimiter: '}',
  });

  return md;
}

// Strip dangerous HTML that markdown-it's `html: true` mode would
// otherwise pass through. We need html:true for the editor's
// ResizableImage <img width="..."> markup, but we never want raw
// <script>, <iframe>, or inline event handlers reaching the EPUB / PDF
// — they're a vector for malicious manuscript content and break
// EPUBCheck. Cheap regex-strip is sufficient because the legitimate
// inputs we accept (img, br, hr, sup, sub, span) are tag-shaped and
// don't contain the patterns we strip.
function sanitizeRawHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe\b[^>]*\/>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
}

function renderItems(md, items, baseDir, opts = {}) {
  const { isPictureBook = false } = opts;
  return items.map(item => {
    // Generated front/back matter items arrive pre-rendered; pass through.
    if (item.rawHtml !== undefined) return { ...item, html: item.rawHtml };
    let html = stripEmptyParagraphs(liftBleedImages(splitLeadingImages(transformImages(sanitizeRawHtml(md.render(item.body ?? '')), baseDir))));
    if (isPictureBook) html = splitIntoPictureBookPages(html);
    return { ...item, html };
  });
}

// Picture-book chapters: each scene-break (`***`) becomes a page break.
// Wrapping each segment in <section class="pb-page"> with `break-after:
// page` is the only reliable way to force pagination in Paged.js — a
// hidden zero-height <hr> with `break-after: page` does NOT work
// consistently. Bleed images already live in their own <div
// class="bleed-page"> from liftBleedImages and stay as-is (they have
// their own page CSS via `page: bleed`).
//
// The transform splits the rendered HTML on the scene-break <hr/>
// markers, drops the markers entirely, and wraps each non-bleed segment
// in a <section class="pb-page">. Bleed-page divs sit between segments
// at the top level of the chapter — Paged.js handles them as their own
// pages via `break-before/after: page` on .bleed-page.
function splitIntoPictureBookPages(html) {
  // Tokenise on either a scene-break <hr/> or a <div class="bleed-page …"> block.
  // Anything else is regular content that belongs to the current text page.
  const tokens = [];
  let cursor = 0;
  const re = /<hr\s+class="scene-break[^"]*"\s*\/>|<div\s+class="bleed-page[^"]*">[\s\S]*?<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m.index > cursor) tokens.push({ kind: 'text', html: html.slice(cursor, m.index) });
    if (m[0].startsWith('<hr')) tokens.push({ kind: 'break' });
    else tokens.push({ kind: 'bleed', html: m[0] });
    cursor = m.index + m[0].length;
  }
  if (cursor < html.length) tokens.push({ kind: 'text', html: html.slice(cursor) });

  // Group consecutive text tokens (separated only by 'break') into
  // pb-page wrappers. Bleed tokens flush the current page and emit
  // themselves at the top level.
  const out = [];
  let buffer = '';
  const flush = () => {
    if (buffer.trim()) out.push(`<section class="pb-page">\n${buffer.trim()}\n</section>`);
    buffer = '';
  };
  for (const t of tokens) {
    if (t.kind === 'text') buffer += t.html;
    else if (t.kind === 'break') flush();
    else if (t.kind === 'bleed') { flush(); out.push(t.html); }
  }
  flush();
  return out.join('\n');
}

// Picture-book full-bleed images need to escape the surrounding <p>
// (which has body padding/margins from the trim CSS) and live as a
// sibling block so the bleed CSS can claim the whole page. Lift any
// <img class="...bleed..."> out of its <p> wrapper and replace it with
// a <div class="bleed-page"> wrapper that the print-pdf CSS targets.
//
// The class allowlist ensures only `bleed` (optionally with `recto` or
// `verso`) reaches the output — anything else is left untouched.
function liftBleedImages(html) {
  // 1. Lift bleed images that markdown-it wrapped in <p>…</p>
  let out = html.replace(
    /<p\b[^>]*>\s*(<img\b[^>]*\bclass="[^"]*\bbleed\b[^"]*"[^>]*\/?>)\s*<\/p>/g,
    (_full, img) => wrapBleed(img),
  );
  // 2. Lift bleed images that already sit at block level (no <p>)
  out = out.replace(
    /(<img\b[^>]*\bclass="[^"]*\bbleed\b[^"]*"[^>]*\/?>)/g,
    (_full, img, offset, src) => {
      // Skip if we already wrapped it in step 1
      const before = src.slice(Math.max(0, offset - 80), offset);
      if (/bleed-page[^>]*>\s*$/.test(before)) return img;
      return wrapBleed(img);
    },
  );
  return out;
}

function wrapBleed(imgTag) {
  // Pull side classes (recto/verso) onto the wrapper so CSS rules like
  // `.bleed-page.recto { break-before: recto }` work.
  const classMatch = imgTag.match(/\bclass="([^"]*)"/);
  const cls = classMatch ? classMatch[1] : '';
  const sides = [];
  if (/\brecto\b/.test(cls)) sides.push('recto');
  if (/\bverso\b/.test(cls)) sides.push('verso');
  const wrapClass = ['bleed-page', ...sides].join(' ');
  return `<div class="${wrapClass}">${imgTag}</div>`;
}

// Strip empty <p></p> that splitLeadingImages can leave behind when an
// image was the entire content of its paragraph. Cosmetic — these would
// render as harmless empty blocks but throw off vertical centring on
// picture-book pages.
function stripEmptyParagraphs(html) {
  return html.replace(/<p\b[^>]*>\s*<\/p>\n?/g, '');
}

// Split any leading <img> out of a <p> into its own paragraph. When the
// markdown source puts an image inline with body text — e.g.
//   <img src="…" />*Macbeth* was written…
// markdown-it produces `<p><img …/>text…</p>`. EPUB readers and Paged.js
// wrap text around the image rather than honouring `display: block` on
// the inline <img>. Splitting it into a sibling <p> guarantees the
// image sits on its own line above the body prose.
function splitLeadingImages(html) {
  return html.replace(
    /(<p\b[^>]*>)((?:<img\s[^>]*>\s*)+)(?=\S)/g,
    (full, pOpen, imgs) => `<p class="img-wrap">${imgs.trim()}</p>\n${pOpen}`,
  );
}

// Two transforms applied to every <img> tag in the rendered HTML:
//
// 1. Rewrite relative `src="..."` paths to absolute file:// URLs.
//    Both downstream stages need this:
//      - EPUB: html-to-epub resolves relative srcs against its temp
//        OEBPS dir, where the project's assets/ folder doesn't exist
//      - Print PDF: the preview HTML lives in output/compiled/, so a
//        relative src like "../assets/foo.jpg" would resolve to
//        output/assets/ rather than the project root
//
// 2. Promote `width="X" height="Y"` attributes to an inline `style`.
//    html-to-epub strips presentational attributes (its allowlist
//    drops width/height) so the writer's resize from the editor is
//    lost in EPUB output. `style` IS allowed through, so writing
//    `style="width: Xpx; height: Ypx"` preserves the dimensions.
function transformImages(html, baseDir) {
  return html.replace(/<img\b([^>]*?)\s*(\/?)>/g, (full, attrs, selfClose) => {
    let updated = attrs;

    // Rewrite src
    updated = updated.replace(/\bsrc="([^"]+)"/, (m, src) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return m;
      return `src="${pathToFileURL(resolve(baseDir, src)).href}"`;
    });

    // Skip the centred-block style for full-bleed images: their CSS
    // takes over the whole page (`width: 100vw`) and can't be combined
    // with `width: Npx` from the editor. The presence of the `bleed`
    // class is the signal.
    const classMatch = updated.match(/\bclass="([^"]*)"/);
    const isBleed = classMatch ? /\b(?:bleed|full-bleed)\b/.test(classMatch[1]) : false;
    if (isBleed) {
      return `<img${updated}${selfClose ? ' /' : ''}>`;
    }

    // Build inline style: width/height (so html-to-epub's allowlist
    // doesn't drop them — width/height attrs are filtered, but style
    // passes through) plus block + auto margins so images sit on their
    // own line, centered, even when the markdown source puts them
    // inline with body text (e.g. `<img/>Macbeth was written…`).
    const widthMatch = updated.match(/\bwidth="(\d+)"/);
    const heightMatch = updated.match(/\bheight="(\d+)"/);
    const styleParts = ['display: block', 'margin-left: auto', 'margin-right: auto'];
    if (widthMatch) styleParts.push(`width: ${widthMatch[1]}px`);
    if (heightMatch) styleParts.push(`height: ${heightMatch[1]}px`);
    const newStyle = styleParts.join('; ');
    const existing = updated.match(/\bstyle="([^"]*)"/);
    if (existing) {
      updated = updated.replace(/\bstyle="[^"]*"/, `style="${newStyle}; ${existing[1]}"`);
    } else {
      updated = `${updated} style="${newStyle}"`;
    }

    return `<img${updated}${selfClose ? ' /' : ''}>`;
  });
}

export async function markdownToHtml(context) {
  if (!context.assembly) {
    throw new Error('HTML conversion requires the assembly phase to run first');
  }

  const md = createRenderer();

  const manuscriptDir = resolve(context.projectPath, context.assembly.manuscriptPath);
  const frontDir = resolve(manuscriptDir, '_front-matter');
  const backDir = resolve(manuscriptDir, '_back-matter');

  // Picture-book mode restructures chapter HTML so each scene-break
  // produces a real page break. Read the flag here rather than in
  // applyBookStyle (which runs later) so the segmentation lands on the
  // chapter HTML before downstream phases see it. Stash the result on
  // context so book-style.js can also branch on it.
  const isPictureBook = readBookTypeIsPictureBook(context.projectPath);
  context.bookType = isPictureBook ? 'picture-book' : 'novel';

  context.html = {
    frontMatter: renderItems(md, context.assembly.frontMatter, frontDir),
    chapters: renderItems(md, context.assembly.chapters, manuscriptDir, { isPictureBook }),
    backMatter: renderItems(md, context.assembly.backMatter, backDir),
  };

  return context;
}

function readBookTypeIsPictureBook(projectPath) {
  try {
    const cfg = JSON.parse(readFileSync(resolve(projectPath, 'compile.config.json'), 'utf-8'));
    return cfg?.bookType === 'picture-book';
  } catch {
    return false;
  }
}
