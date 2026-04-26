# M5 — Compile Pipeline

## Goal

Writers can compile their manuscript to EPUB and print-ready PDF from within
the app. No command line, no external tools, no configuration file to hand-edit.

## Deliverables

### CompilePanel webview

A modal-style panel (or sidebar panel) with:
- Book metadata form: title, author, cover image (file picker)
- Format selection: EPUB / Print PDF
- Chapter ordering (drag to reorder if needed, defaults to filename order)
- "Compile" button
- Progress indicator during compile
- "Open output" link when complete

On first open, pre-fills from `compile.config.json` if it exists. Saves back
on each compile.

### EPUB output

Ported from `storyline-vsc` — uses `@lesjoursfr/html-to-epub`.

Pipeline:
1. Read all `.md` files in `manuscript/` in filename order
2. Convert markdown to HTML via `markdown-it`
3. Apply chapter breaks, scene break rendering (`* * *` → `<hr class="scene-break">`)
4. Inject cover image if provided
5. Write `output/<title>-<date>.epub`

Themes ported from `storyline-vsc` (Heritage, Modern Sans, default).

### Print PDF output

Ported from `storyline-vsc` — uses Puppeteer (bundled).

Pipeline:
1. Same markdown → HTML conversion as EPUB
2. Apply print CSS (page margins, running heads, page numbers, orphan/widow control)
3. Render via Puppeteer headless
4. Write `output/<title>-<date>.pdf`

Print spec: A5 (standard trade paperback), 12pt body, appropriate margins.
US Letter variant available via config.

### Compile configuration

`compile.config.json` in project root. Created by the CompilePanel on first
compile, editable directly if needed.

```json
{
  "metadata": {
    "title": "My Novel",
    "author": "Jane Smith",
    "language": "en",
    "coverImage": "assets/cover.jpg"
  },
  "epub": {
    "theme": "heritage"
  },
  "pdf": {
    "pageSize": "A5",
    "theme": "heritage"
  },
  "manuscript": {
    "path": "manuscript",
    "chapterPattern": "chapter-*.md"
  }
}
```

### Non-fiction compile extensions

When `state.mode === 'nonfiction'`, the compile pipeline adds extra output
generated from the planning state — not extracted from the prose.

These are ported directly from `storyline-vsc`:
- `lib/research/compile.js` — endnote and bibliography generation
- `lib/compile/nf-extras.js` — orchestrator (`runNfExtras()`)

**Endnotes**

Footnote markers appear as superscript numbers in the manuscript prose.
The footnote bodies live in the TipTap document model (added via the `fn`
toolbar button during writing), not in the planning state.

At compile time:

| Format | Rendering |
|--------|-----------|
| EPUB | Chapter endnotes — all footnotes for a chapter appear on a dedicated page immediately after the chapter text. Reflowable EPUB cannot guarantee page-bottom positioning, so endnotes are the standard. |
| Print PDF | Page-bottom footnotes — each footnote appears at the bottom of the page on which its marker appears, separated from the body text by a short rule. |

**Bibliography**

Generated from research items captured during the planning stages
(`state.research` array). Not extracted from the manuscript text.

Citation style selector in CompilePanel (shown for non-fiction projects only):

| Style | Default |
|-------|---------|
| Chicago | ✓ |
| APA | — |
| MLA | — |

Implementation: `formatChicago()`, `formatAPA()`, `formatMLA()` in
`lib/research/compile.js` — port directly, no rebuild required.

**Non-fiction extras** (generated into `output/` alongside EPUB/PDF)

These are also ported from `lib/compile/nf-extras.js`:
- `fact-check-report.md` — list of claims flagged for verification
- `skill-tree.md` — reader progression map through the book's ideas
- `timeline.md` — chronological events referenced in the manuscript
- `objection-index.md` — anticipated reader objections and where they are addressed

These are writer tools — they're not packaged into the EPUB or PDF. They
appear in `output/nonfiction/` and open naturally in VS Code.

`runNfExtras()` generates all four in a single pass. Call it after the
main compile completes.

**CompilePanel additions for non-fiction**

- Citation style selector (Chicago / APA / MLA) — visible when `state.mode === 'nonfiction'`
- "Generate non-fiction extras" checkbox — checked by default

`compile.config.json` extended for non-fiction:

```json
{
  "nonfiction": {
    "citationStyle": "chicago",
    "generateExtras": true
  }
}
```

### Commands

- `Storyline: Compile to EPUB` — opens CompilePanel pre-set to EPUB
- `Storyline: Compile to PDF` — opens CompilePanel pre-set to PDF
- `Storyline: Open Output Folder` — reveals `output/` in Finder/Explorer

## Technical tasks

- [ ] Port compile pipeline from `storyline-vsc` (markdown-it, EPUB, PDF)
- [ ] Port all themes (Heritage, Modern Sans)
- [ ] Build CompilePanel webview (metadata form, format selector, progress)
- [ ] Implement `compile.config.json` read/write
- [ ] Wire EPUB compile command
- [ ] Wire PDF compile command
- [ ] Test EPUB output in Apple Books and Kindle Previewer
- [ ] Test PDF output (margins, page numbers, scene breaks)
- [ ] Implement chapter ordering UI (drag handles, defaults to filename order)
- [ ] Implement cover image file picker
- [ ] Register compile commands in `package.json`
- [ ] Port `lib/research/compile.js` from `storyline-vsc` — endnotes, bibliography, citation formatters
- [ ] Port `lib/compile/nf-extras.js` from `storyline-vsc` — `runNfExtras()` orchestrator
- [ ] Implement EPUB endnote rendering (chapter endnotes page after each chapter)
- [ ] Implement PDF footnote rendering (page-bottom, rule separator)
- [ ] Add citation style selector to CompilePanel (NF projects only)
- [ ] Add "Generate non-fiction extras" checkbox to CompilePanel
- [ ] Write non-fiction extras to `output/nonfiction/` after compile
- [ ] Extend `compile.config.json` schema with `nonfiction` block

## Dependencies

M4 (editor and layout in place, manuscript files exist to compile).

## Success criteria

- EPUB opens correctly in Apple Books — cover image, chapter breaks, correct
  font rendering
- EPUB passes Kindle Previewer validation
- PDF renders correctly at A5 — page numbers, running heads, scene breaks
- 100K word manuscript compiles to EPUB in under 20 seconds
- 100K word manuscript compiles to PDF in under 45 seconds
- `compile.config.json` persists author/title across VS Code restarts
- Non-fiction EPUB: footnotes appear as chapter endnotes on a dedicated page
- Non-fiction PDF: footnotes appear at page bottom with rule separator
- Bibliography generated correctly in Chicago, APA, and MLA styles
- Non-fiction extras written to `output/nonfiction/` without errors
- Citation style selection persists in `compile.config.json`
