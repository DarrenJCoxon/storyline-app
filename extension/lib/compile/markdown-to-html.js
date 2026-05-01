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
import { resolve } from 'path';
import { pathToFileURL } from 'url';

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

  return md;
}

function renderItems(md, items, baseDir) {
  return items.map(item => {
    // Generated front/back matter items arrive pre-rendered; pass through.
    if (item.rawHtml !== undefined) return { ...item, html: item.rawHtml };
    return { ...item, html: splitLeadingImages(transformImages(md.render(item.body ?? ''), baseDir)) };
  });
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

  context.html = {
    frontMatter: renderItems(md, context.assembly.frontMatter, frontDir),
    chapters: renderItems(md, context.assembly.chapters, manuscriptDir),
    backMatter: renderItems(md, context.assembly.backMatter, backDir),
  };

  return context;
}
