# Milestone 12 — Word document import

_Status: **PLANNED** — design complete, scope agreed, not yet started._
_Parent: [./roadmap.md](./roadmap.md)_
_Sibling import milestone: [milestone-09-scrivener-import.md](./milestone-09-scrivener-import.md) (Scrivener)_
_Last updated: 2026-05-03_

## Outcome

A writer with an existing manuscript in **Microsoft Word (.docx)** — the dominant exchange format among professional writers, agents, and editors — can run **Storyline: Import Word Document**, pick their `.docx`, preview the auto-detected chapter split, and end up with a populated `manuscript/` directory of `chapter-NN.md` files following the same convention `storyline.newChapter` already uses. The chapters open in the rich editor; the existing AI critique flow works on them with no extra wiring.

This is **Storyline's Vellum-equivalent import** — Vellum's "Import Word" feature is the gold-standard novelist UX for this and what writers will compare against.

## Why this milestone exists

Two distinct user populations land here:

1. **Writers with finished or partial drafts** elsewhere (Word, Google Docs exported as Word, Pages exported as Word) who want to bring their existing prose into Storyline to use the AI editing/critique tooling.
2. **Writers iterating between Storyline and editors / agents / collaborators** who only accept `.docx`. They compile out, share, get edits back as a marked-up Word doc, and need a way to bring the changes back in.

Both are migration friction. Without import, the answer is "copy-paste chapter by chapter" — the same adoption-killer Scrivener import was logged to solve. Word is a strictly bigger user base than Scrivener.

The asks that triggered this milestone:

> "users want to be able to upload their own word docs to the app so that they can use AI to edit and improve them"
> "Vellum has an import word feature that breaks chapters into separate chapter files"

## Prove-it gate

All three must be true:

1. **A real novel-length .docx imports cleanly.** A 60-90k-word manuscript with H1 chapter headings imports into a `manuscript/` directory of one `chapter-NN.md` per chapter. The chapter count and order match the source. The first imported chapter opens in the rich editor and renders the prose correctly (italics, bold, scene breaks).
2. **Compile round-trips.** The imported `manuscript/` compiles to a valid EPUB via the existing pipeline with no manual intervention. Word counts in the EPUB match the Word doc (within 1% — minor drift from heading text being re-emitted is acceptable).
3. **The "what was dropped" notice is honest and useful.** Preview panel shows: "X images stripped, Y comments dropped, track changes accepted (final version imported), Z footnotes kept inline." Writer reads it and is not surprised.

## Library choice

**`mammoth`** for DOCX → HTML, **`turndown`** for HTML → Markdown.

Mammoth is the standard pick for this in JS:

- Maintained, widely used, small dep
- Preserves Heading 1/2/3, italics, bold, lists, footnotes, page breaks
- Strips Word's track-changes (accepts the final version) and comments by default — exactly the behaviour we want
- Can extract images on demand or be told to strip them — also what we want

Alternatives considered:

- **`docx4js`** — heavier, richer, more low-level. Overkill for "extract clean prose."
- **Pandoc shell-out** (the M09 Scrivener approach) — works but adds a hard runtime dependency on the writer's machine. Mammoth is a single npm dep we can bundle.

`turndown` is the natural pairing: HTML → Markdown with good handling of italics, bold, and (importantly for novelists) preserves emphasis-as-syntax rather than as styling.

## Chapter splitting algorithm

Vellum's implementation splits on **(a) Heading 1 styles** and **(b) manual page breaks**. We do the same with a deterministic fallback chain:

```
1. If document has any H1 headings        → split on H1
2. Else if document has any H2 headings   → split on H2
3. Else if document has manual page breaks → split on page break
4. Else                                    → single chapter, surface a warning
```

Mammoth preserves H1 / H2 (`<h1>`, `<h2>`) and page breaks (typically as `<p style="page-break-before: always">` or similar). Splitter walks the converted HTML and partitions at boundary nodes.

### Chapter title

Heading text becomes the chapter title:

- "Chapter One" → file `chapter-01.md`, first line `# Chapter One`
- "1." → `chapter-01.md`, first line `# 1.`
- "Prologue" → `chapter-01.md`, first line `# Prologue`

The numeric filename uses **import order**, not the heading's number — a writer with a "Chapter One" / "Chapter Three" / "Chapter Two" sequence still gets `chapter-01.md` / `chapter-02.md` / `chapter-03.md` in source order. Storyline's compile pipeline reads alphabetically, so file order = compile order; we honour the writer's intent.

### Front matter

Anything before the first heading (dedication, epigraph, table of contents, preface, etc.) → `chapter-00-front-matter.md` per agreed-Vellum-style behaviour. The writer can keep it, edit it, or delete it post-import. Vellum keeps it; we keep it.

### No-structure fallback

If the document has neither headings nor page breaks → write the whole prose to `chapter-01.md` with a warning: "Couldn't auto-detect chapters — split manually using the New Chapter command." Don't fail the import; an unsplittable manuscript still beats not-imported.

## Markdown conversion rules

Turndown is configured to:

- `<h1>` → `# `, `<h2>` → `## ` (preserve heading hierarchy *inside* chapters; the splitting boundary is the chapter title itself which becomes the file's first line)
- `<em>` → `*...*`, `<strong>` → `**...**` — novelists rely on these heavily
- Footnotes (mammoth emits as `<sup><a href="#fn1">[1]</a></sup>` + `<ol class="footnotes">` block) → kept inline as raw HTML passthrough (turndown can be told to leave them alone). Writer keeps the footnote semantics; the compile pipeline already handles inline HTML.
- Scene breaks: detect either `<p>* * *</p>` or `<hr>` → emit `* * *` per existing manuscript convention. Empty-paragraph runs are dropped.
- `<img>` tags → stripped entirely; counted for the warnings panel.

## What gets dropped (intentionally)

| Word feature | Behaviour | Why |
|---|---|---|
| **Track changes** | Final version imported (changes accepted) | Mammoth default; writers expect "the latest version" of their document |
| **Comments / annotations** | Dropped, count surfaced in preview | Editorial back-and-forth doesn't belong in clean source manuscript |
| **Embedded images** | Stripped, count surfaced in preview | Storyline generates illustrations via its own pipeline; importing inline images would conflict with that workflow |
| **Tables** | Best-effort markdown table or stripped with warning | Novels rarely use tables; non-fiction will need a follow-up |
| **Custom styles** | Mapped to nearest Markdown equivalent or stripped | Writers' bespoke "Body Text 2" / "Quote Heavy" styles don't survive any cross-format conversion cleanly |
| **Headers / footers / page numbers** | Stripped | Compile pipeline owns pagination |
| **Field codes (auto numbering, dynamic dates)** | Last-rendered value imported | We can't re-evaluate Word fields; best we can do is the value Word last computed |

## UX flow

New command **`storyline.importDocx`**:

1. Command palette OR right-click on `manuscript/` folder OR button on the empty-manuscript hint in the welcome doc
2. `vscode.window.showOpenDialog` filtered to `.docx`
3. Mammoth + splitter run in-memory; result handed to the **`ImportPanel`** webview
4. Preview panel shows:
   - File name + word count
   - Detected strategy (H1 / H2 / page break / no-split) with manual override dropdown
   - Chapter list: title + word count + first 200 chars + warning pills
   - Top-level warnings: "3 images stripped · 12 comments dropped · track changes accepted (final version)"
   - Target folder + create-vs-append disposition (see below)
   - **[ Cancel ]** and **[ Import N chapters ]** buttons
5. On confirm → markdown conversion runs per chunk → files written → first imported chapter opens in the rich editor.

### Disposition: never overwrite

If `manuscript/` is empty (or contains only the seed `chapter-01.md` from project scaffold), import writes `chapter-00-front-matter.md` (if any) + `chapter-01.md`...`chapter-NN.md`.

If `manuscript/` already has writer-authored chapters, the panel shows a **modal confirm**:

- **Append** → continues numbering from `max(chapter-NN) + 1`. Front matter from the new doc gets a disambiguating filename (`chapter-NN-import-front-matter.md`) so it doesn't claim slot `00`.
- **Cancel** → no writes. (M1 deliberately does NOT offer Replace — too destructive for a first cut. Writers who want a clean slate can delete the existing files manually.)

This matches the existing `writeIfMissing` discipline in [extension/src/onboarding/project-scaffold.ts](../../extension/src/onboarding/project-scaffold.ts) and the convention `storyline.newChapter` follows.

## Architecture sketch

```
extension/src/import/
├── docx-to-html.ts           — mammoth wrapper; returns { html, warnings[] }
├── chapter-splitter.ts       — pure: HTML → ChapterChunk[]; testable in isolation
├── html-to-markdown.ts       — turndown wrapper with novelist-tuned rules
├── chapter-writer.ts         — ChapterChunk[] → manuscript/chapter-NN.md (respects append disposition)
└── __tests__/
    ├── chapter-splitter.test.ts   (pure HTML-string fixtures, fast)
    └── fixtures/
        ├── h1-split.docx
        ├── h2-only.docx
        ├── page-break-only.docx
        ├── no-structure.docx
        ├── with-frontmatter.docx
        └── with-footnotes-images-comments.docx (the kitchen-sink case)

extension/src/panels/
└── ImportPanel.ts            — preview UI, commit button, postMessage protocol

extension/src/extension.ts    — register storyline.importDocx command

extension/package.json        — command entry, contextual menu, deps
```

### Splitter algorithm (pseudocode)

```
function splitChapters(html, strategy = 'auto'):
  nodes = parse(html).body.children

  if strategy === 'auto':
    if anyH1(nodes):       strategy = 'h1'
    elif anyH2(nodes):     strategy = 'h2'
    elif anyPageBreak():   strategy = 'page-break'
    else:                  return [{ title: 'Chapter 1', html: allNodes, ... }] + warning('no-structure')

  chunks = []
  current = { title: null, html: [] }

  for node in nodes:
    if isSplitBoundary(node, strategy):
      if current.html.length: chunks.push(finalize(current))
      current = { title: textOf(node), html: [] }
    else:
      current.html.push(node)

  if current.html.length: chunks.push(finalize(current))

  // Front matter — anything before the first titled chunk
  if chunks[0].title === null:
    chunks[0].title = 'Front Matter'
    chunks[0].isFrontMatter = true

  return chunks
```

The splitter is a **pure function** — no DOM, no FS, no mammoth. It takes a parsed HTML structure and returns plain objects. That makes the test layer fast and high-coverage.

## Dependencies

- `mammoth` (npm, ~50 KB gzipped)
- `turndown` + `@types/turndown` (npm, ~20 KB gzipped)
- No system-level dependencies (unlike M09 Scrivener which needs Pandoc)
- Should land **after M6 ships** so the rich editor + manuscript layout are stable

## Risks

**Mammoth's HTML output drifts between Word versions.** Word 2016 / 2019 / 365 emit subtly different `.docx` internals, and mammoth's coverage is excellent but not perfect. First-pass import will have edge cases — plan for an iterative fixture set informed by real imports, not exhaustive upfront design. Cap scope: if a feature isn't in the first three real test docs, defer.

**Footnotes are the highest-risk preserved content.** Mammoth emits them as inline-linked `<sup>` + bottom `<ol>`. Turndown's default behaviour mangles this. We need a custom turndown rule that passes the footnote markup through as raw HTML so the compile pipeline can render it. Test this carefully on a doc with 20+ footnotes (typical academic / heavily-researched non-fiction).

**Headings styled visually instead of semantically.** Some writers hand-format chapter titles by enlarging text rather than applying the H1 style. Mammoth respects what Word stores — it sees that as a paragraph with a font-size override, not a heading. Result: zero H1s detected, falls through to page-break or no-split. The UX recovery is the strategy-dropdown override in the preview panel; document this clearly.

**Pages-export-as-Word and Google-Docs-export-as-Word are common.** Both produce `.docx`, both have quirks. Test fixtures from both.

**"Import" implies round-trip.** Writers will ask "can I export back to Word and re-import to update Storyline?" The honest answer is "compile to Word docx for sharing, but don't re-import — the Storyline manuscript is the source of truth once imported." Document this; name the command `Import` (not `Sync`) accordingly.

**Comments hold real editorial signal.** Dropping 12 comments could lose feedback the writer wanted. M1 surfaces the count in the preview but doesn't import them. M2 (or later) might dump them to a sibling `imports/comments.md` file or as `{{...}}` inline research markers.

## Cut list (explicitly NOT in this milestone)

- **Round-trip export and re-import** (Storyline → Word → Storyline). Compile-to-docx exists for sharing; not for re-importing.
- **Track-changes preservation.** We accept the changes and import the final version. Preserving Word's revision history isn't useful in markdown.
- **Comments imported as inline markers or sidebar notes.** Counted in the preview, otherwise dropped. M2+ candidate.
- **Embedded image extraction to `manuscript/images/`.** Stripped with warning. M2+ candidate if writers ask.
- **Table import as Markdown tables.** Stripped with warning in M1. Non-fiction tooling can pick this up later.
- **`.doc` (legacy binary format).** `.docx` only. Writers with `.doc` files re-save in Word as `.docx` first.
- **Pages, ODF, RTF.** Each is its own milestone if there's demand.
- **Scrivener.** Already its own milestone (M09).
- **Replace mode** (wipe existing `manuscript/` and import fresh). Append-only in M1; manual delete is an acceptable workaround for the rare case.
- **AI-driven post-import improvement** (run critique automatically on every imported chapter). The existing chat works on imported chapters via paste — no automatic surface needed in M1.

## Suggested phasing

**M1 — MVP (~1 week)**

- Deps + `docx-to-html.ts` + `chapter-splitter.ts` + `html-to-markdown.ts` + `chapter-writer.ts`
- `storyline.importDocx` command with a minimal confirm-modal flow (no `ImportPanel` webview yet)
- H1 split, H2 fallback, page-break fallback, no-structure single-chapter fallback
- Strip images (count) · drop comments (count) · accept track changes · keep footnotes inline
- Append-only with confirm if `manuscript/` non-empty
- Tests on 5+ fixture docs

**M2 — Polish (~3-5 days, separate ship)**

- Replace the modal with the full `ImportPanel` webview (live preview, strategy override dropdown, per-chapter word counts + first-line previews)
- Image extraction option (`Strip` / `Extract to manuscript/images/`)
- Comments import option (`Drop` / `Save to imports/comments.md` / `Inline as {{...}}` markers)
- Better turndown rules informed by real-import bug reports

**M3 — AI integration (separate, deferred — own milestone candidate)**

- Right-click "Storyline: Improve this passage" on a selection in the rich editor
- Streams a revision into the editor via the existing AI provider stack
- Doesn't depend on import per se; the import unlocks the user need ("I have prose, now help me improve it")

## Definition of done (when M1 ships)

- `storyline.importDocx` command works end-to-end on novel-length docs
- Files written follow the existing `chapter-NN.md` convention; first imported chapter opens in the rich editor
- Compile pipeline produces a valid EPUB from the imported manuscript without manual intervention
- Strip-image + drop-comments counts surfaced in the confirm modal
- Footnotes preserved in the markdown output and render correctly via the compile pipeline
- Append-only behaviour confirmed; never overwrites writer-authored files
- Pure splitter has unit tests covering H1 / H2 / page-break / no-structure / front-matter / empty-chunk / whitespace-only-heading edge cases
- One end-to-end integration test that runs mammoth + splitter + writer on a fixture `.docx`
- `docs/` gains an `importing-word.md` page with the scope statement, strategy explanation, and known limitations

## Open questions deferred to build time

- **Strategy detection threshold.** What if a doc has 1 H1 and 47 H2s? Is that an H1 split (one giant chapter, the rest "unnumbered subsections") or an H2 split (treat the lone H1 as a part heading)? Suggest: if H1 count < 3, prefer H2. Decide with real fixtures.
- **Empty chapters.** Should we silently drop chunks with 0 words, or preserve them as placeholders? Suggest: drop, with a count in the warnings.
- **Heading-text hygiene.** "Chapter Three" with a typo "Chaptr Three" — do we silently fix it for the filename slug? Suggest: no, faithful to source. Filename uses position; chapter title preserves the typo.
- **Metadata harvesting.** `.docx` carries author / title / created-date in `core.xml`. Do we read those and offer to populate `.storyline/state.json`'s `_meta` block? Suggest: M2+, opt-in via a checkbox in the preview panel.

## Lessons learned

_To be filled in at milestone closure._
