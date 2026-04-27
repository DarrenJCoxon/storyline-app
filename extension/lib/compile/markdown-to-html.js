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

// Curly quote pairs: left-double, right-double, left-single, right-single.
// markdown-it's typographer uses these to convert straight quotes.
const CURLY_QUOTES = '\u201c\u201d\u2018\u2019';

function createRenderer() {
  const md = new MarkdownIt({
    html: false,       // no raw HTML — safety for EPUB validation
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

function renderItems(md, items) {
  return items.map(item => ({
    ...item,
    html: md.render(item.body),
  }));
}

export async function markdownToHtml(context) {
  if (!context.assembly) {
    throw new Error('HTML conversion requires the assembly phase to run first');
  }

  const md = createRenderer();

  context.html = {
    frontMatter: renderItems(md, context.assembly.frontMatter),
    chapters: renderItems(md, context.assembly.chapters),
    backMatter: renderItems(md, context.assembly.backMatter),
  };

  return context;
}
