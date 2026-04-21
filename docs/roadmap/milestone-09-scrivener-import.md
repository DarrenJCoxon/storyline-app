# Milestone 9 — Scrivener manuscript import

_Status: **EXPLORATORY** — logged for a future phase, not started._
_Parent: [../roadmap.md](../roadmap.md)_
_Last updated: 2026-04-21_

## Outcome

A writer with an existing Scrivener project can run `storyline import scrivener <path-to-.scriv>` and end up with a populated `manuscript/` directory containing their prose as markdown files, with the binder's part/chapter/section hierarchy preserved through filename ordering. Everything else in the Scrivener project is ignored by design.

## Why this milestone exists

Scrivener has a large, committed user base. Writers considering a move to Storyline will not retype their manuscript, and asking them to manually copy-paste chapter by chapter is the kind of migration friction that kills adoption. A one-way importer that handles the prose — and only the prose — is the minimum viable migration path.

Scope is deliberately narrow: **manuscript text only.** Research folders, Notes, Characters, keywords, labels, status, synopses, snapshots, compile settings, custom metadata — all dropped. Writers migrating to Storyline are choosing a different planning model (Save the Cat in `.storyline/state.json`); their Scrivener planning artefacts don't map and shouldn't pretend to.

## Prove-it gate

Both must be true:

1. **Real Scrivener project imports cleanly.** Take a real, substantial Scrivener project (ideally your own, or a known writer's). Run the importer. The resulting `manuscript/` directory compiles to a valid EPUB via the existing pipeline. The part/chapter/section order in the compiled EPUB matches the binder order in Scrivener.
2. **A "what was dropped" report is honest and useful.** The importer prints a summary: "Imported N chapters totalling M words. Did not import: Research (X documents), Characters (Y documents), keywords, labels, synopses, notes, snapshots, compile settings." The writer reads it and is not surprised.

## What the format actually is

A `.scriv` is a macOS bundle (directory):

```
MyNovel.scriv/
├── MyNovel.scrivx              ← XML: binder tree, titles, UUIDs, types
├── Files/Data/<UUID>/
│   ├── content.rtf             ← the prose
│   ├── synopsis.txt            ← IGNORED
│   └── notes.rtf               ← IGNORED
├── Snapshots/                  ← IGNORED
└── Settings/                   ← IGNORED
```

The `.scrivx` is plain XML. The binder is a nested tree of `<BinderItem>` nodes with a `Type` attribute (`Folder`, `Text`, or similar) and a UUID that keys into `Files/Data/`. Walk the tree under the "Manuscript" / "Draft" root folder; ignore siblings like Research and Front Matter Templates unless the writer has written actual prose there (edge case — flag it).

## Architecture sketch

```
lib/import/
├── scrivener/
│   ├── index.js              (entry point — takes .scriv path, writes manuscript/)
│   ├── scrivx-parser.js      (XML → in-memory binder tree, manuscript subtree only)
│   ├── rtf-to-markdown.js    (Pandoc shell-out + Scrivener-specific post-processor)
│   ├── filename-policy.js    (binder hierarchy → flat alphabetical filenames)
│   └── import-report.js      (the "what was dropped" summary)
```

### The one real design question: hierarchy → flat filenames

Storyline's compile pipeline reads `manuscript/*.md` in **alphabetical order**. There is no subdirectory hierarchy. So a Scrivener binder like:

```
Manuscript/
├── Part I
│   ├── Chapter 1
│   │   ├── Scene 1
│   │   └── Scene 2
│   └── Chapter 2
└── Part II
    └── Chapter 3
```

needs to flatten to something that sorts correctly:

```
manuscript/
├── 01-part-i-ch01.md        ← Chapter 1 (scenes joined with scene-break nodes)
├── 02-part-i-ch02.md        ← Chapter 2
└── 03-part-ii-ch03.md       ← Chapter 3
```

Policy to resolve at build time (not now):

- **One file per chapter.** Scenes within a chapter join into that chapter's `.md`, separated by Storyline's scene-break node (the convention Stories 2.4 / 3.x established).
- **Parts become filename prefixes**, not separate files. Part-level headings can be injected at the top of the first chapter in each part as an H1, with chapters as H2 — or parts can be signalled only through filename ordering and the compile pipeline infers them. Pick one; don't try to support both.
- **Zero-padded numeric prefix** guarantees stable alphabetical sort regardless of chapter count.
- **Scrivener "Folder" type with prose** (some writers put text on the folder itself, not children) → treat as a chapter in its own right.

Filename slugs come from the binder title, lowercased, punctuation stripped, spaces → hyphens. Title collisions get a disambiguating suffix.

## Dependencies

- Requires **Pandoc** installed on the writer's machine, or bundled with the extension. Pandoc handles the RTF→markdown core; we write a thin post-processor for Scrivener-specific artefacts (inline annotations, inline footnotes, smart-quote cleanup).
- Should land **after M6 ships** so the compile pipeline is stable. Importing into a moving target is painful.
- Does **not** depend on M7 (multi-engine refactor) — the importer is Storyline-specific; other engines can build their own.

## Risks

**RTF post-processing is a long tail.** Pandoc covers the basics; every Scrivener writer has used some feature that produces weird RTF (inline Research links, custom styles, images embedded in the document, tables). First-pass import will have quirks. Plan for an iterative post-processor informed by real imports, not upfront design. Cap scope: if an RTF feature isn't in the first three real test projects, we don't support it.

**Scene break ambiguity.** Scrivener writers split scenes either (a) as separate documents under a chapter folder, or (b) with inline `* * *` / `#` markers inside one document, or (c) with a Scrivener-specific scene separator style. The importer must handle (a) — joining with explicit scene-break nodes — and leave (b)/(c) alone (Pandoc preserves the text; writer cleans up post-import). Document this clearly.

**"Import" implies round-trip.** Writers will ask "can I import back into Scrivener if I change my mind?" No. This is one-way. Name the command accordingly (`import` is fine; "migrate" would be more honest but clunkier) and say so in the CLI help.

**Writers with non-standard binder roots.** Scrivener's top-level folder is usually "Manuscript" or "Draft" but writers rename it. Detect by `<BinderItem>` attribute (there's typically a "manuscript root" flag on the project metadata) rather than by matching the name string.

**The dropped-data report must not look like failure.** Writers will see "did not import: 47 documents in Research" and panic. Frame the report as "imported your manuscript; your Research, Notes, Characters, and planning data remain in the original Scrivener project, which is untouched." Tone matters.

## Cut list (explicitly NOT in this milestone)

- **Research / Notes / Characters / any non-manuscript binder content.** The user's stated scope. Ignored.
- **Keywords, labels, status, custom metadata, colour tags.** Not imported, not mapped to anything in Storyline.
- **Synopsis / index cards.** Not imported. The writer's Stage 10 Scene Outline in `state.json` is not seeded from Scrivener synopses.
- **Notes fields (`notes.rtf` per document).** Not imported. These are often where real thinking lives, and dropping them hurts — but the user has explicitly scoped this to manuscript only.
- **Snapshots / document version history.** Not imported.
- **Compile settings.** Storyline has its own compile pipeline with different primitives. No mapping attempted.
- **Footnotes, comments, annotations, inline citations.** Flagged in the import report; writer hand-converts if needed. First version doesn't try to translate them.
- **Images embedded in RTF.** Flagged and skipped. Writer re-inserts post-import.
- **Round-trip export (Storyline → Scrivener).** One-way only. Not a goal.
- **Automatic state.json seeding from Scrivener data.** The whole point of Storyline is its own planning model. Import is manuscript-only; the writer plans from scratch (or skips planning) on this side.
- **Migration from other tools** (Ulysses, iA Writer, Word). Each is its own project. Don't generalise prematurely.

## Definition of done (when this milestone eventually runs)

- `storyline import scrivener <path>` command works end-to-end
- Real Scrivener project imports to a `manuscript/` that compiles clean via the EPUB pipeline
- Dropped-data report is honest, non-alarming, and complete
- Hierarchy-to-filename policy documented and consistent
- Pandoc dependency is either bundled or clearly flagged with install instructions
- `docs/` gains an `importing-scrivener.md` page with the scope statement and known limitations

## Lessons learned

_To be filled in at milestone closure._
