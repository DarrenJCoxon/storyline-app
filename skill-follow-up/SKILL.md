---
name: "follow-up"
version: "1.1.6"
description: "Resolve inline {{bracketed notes}} the writer has left in their manuscript as research stubs or TBDs. Scoped to the file currently open in VS Code (via .storyline/active-file.txt breadcrumb) or the project-configured manuscript directory. Classifies each note as a factual lookup, a plan-consistency query, or a writer-decision; proposes resolutions; applies approved edits in place; then re-syncs manuscript memory."
metadata:
  priority: 9
  pathPatterns:
    - 'manuscript/**/*.md'
    - 'output/manuscript/**/*.md'
    - '.storyline/active-file.txt'
  bashPatterns:
    - '\bstoryline-cli\s+manuscript\s+notes\b'
  promptSignals:
    phrases:
      - "follow-up"
      - "follow up notes"
      - "check my notes"
      - "resolve my TBDs"
      - "research my notes"
      - "action my bracketed notes"
    anyOf:
      - "follow-up"
      - "curly brackets"
      - "bracketed notes"
      - "inline notes"
      - "TBDs"
retrieval:
  aliases:
    - follow-up
    - curly-brace notes
    - inline notes
    - research notes
  intents:
    - resolve inline notes
    - research bracketed TBDs
    - action follow-up items
  entities:
    - curly-brace note
    - bracketed note
    - TBD
    - research stub
---

# /follow-up — Resolve inline `{{bracketed}}` research notes

While drafting prose, the writer can stay in flow by leaving `{{double-curly}}` markers where a fact, decision, or verification is needed:

```
She opened the laptop — {{need to research the specifications of a 2019 MacBook Pro}} — and began typing.

They met outside the museum. {{check the British Museum opening times}} The doors were locked.

{{why would a locksmith carry a blowtorch in 1923?}}
```

`/follow-up` is the automated pass that resolves these notes: it finds them, classifies them, researches or answers each one, proposes the resolution, and — on the writer's approval — edits the manuscript file in place and commits the outcome to memory.

## Marker formats supported

The scanner accepts three formats so writers coming from older Storyline projects don't lose their notes:

| Format | Status | Example |
|---|---|---|
| `{{...}}` | **Current — recommended** | `{{check the museum hours}}` |
| `<...>` | Legacy — still accepted | `<check the museum hours>` |
| `&lt;...&gt;` | Legacy — still accepted (produced by older rich-text save paths that HTML-encoded angle brackets) | `&lt;check the museum hours&gt;` |

If a project contains legacy markers, offer to run `npx storyline-cli manuscript migrate-markers` once — this previews then rewrites every `<...>` and `&lt;...&gt;` to `{{...}}` in place, so future scans stay simple.

## CLI invocation note (READ FIRST)

Storyline ships as the npm package **`storyline-cli`** and is run via `npx`. Users do not have a global `storyline` binary on their PATH. Every CLI call below must be made as `npx storyline-cli <subcommand>`.

## Step 1 — Determine which file(s) to scan

Resolve scope in the following priority order. Move to the next step as soon as one succeeds.

### 1a. Explicit argument from the writer

If the writer typed `/follow-up <path>` (e.g. `/follow-up manuscript/chapter-03.md` or `/follow-up output/manuscript/scene-1.md`), use that path verbatim. Skip the other resolution steps.

### 1b. Active-file breadcrumb

Read the breadcrumb written by the VS Code extension:

```bash
cat .storyline/active-file.txt 2>/dev/null
```

If present, its single line is the workspace-relative path of the manuscript file the writer most recently focused. Verify the file still exists and ends in `.md`. If good, scope `/follow-up` to that file.

### 1c. Project-configured manuscript directory

Read `writing.manuscriptPath` from `.storyline/state.json`:

```bash
node -e "const s=require('./.storyline/state.json');console.log(s.writing?.manuscriptPath||'manuscript')"
```

If that directory contains `.md` chapter files, scope the scan to the whole directory by running the scanner without `--file`. If the directory is empty or missing, fall through.

### 1d. Fallback paths

If the configured path is empty, probe common alternatives in order:
- `manuscript/`
- `output/manuscript/`

Use whichever contains `.md` files.

### 1e. Ask the writer

If none of the above yields `.md` files, ask:

> "Which chapter would you like me to follow up on? (e.g. `manuscript/chapter-03.md`, or say 'all' to scan whatever manuscript files exist.)"

Whatever scope you resolved, tell the writer before scanning:

> Scanning `manuscript/chapter-03.md` for inline notes…

When scope is broader than a single file, say so explicitly so the writer knows.

## Step 2 — Extract the notes

Run the scanner on the chosen scope:

```bash
# single file
npx storyline-cli manuscript notes --file <path> --json

# whole manuscript directory (uses state.writing.manuscriptPath)
npx storyline-cli manuscript notes --json
```

The scanner returns JSON of shape:

```json
{
  "notes": [
    {
      "file": "manuscript/chapter-03.md",
      "filename": "chapter-03.md",
      "chapterNumber": 3,
      "line": 12,
      "column": 34,
      "note": "check the British Museum opening times",
      "raw": "{{check the British Museum opening times}}",
      "style": "curly",
      "contextBefore": "outside the museum.",
      "contextAfter": "The doors were locked."
    }
  ],
  "memoryEntries": [],
  "memoryLogPath": null
}
```

**Parse `result.notes`** — that's the array you iterate. The `style` field tells you which marker format was found (`curly`, `angle-literal`, or `angle-encoded`). The `raw` field holds the exact bytes on disk — use this as the search string when editing the file later.

If `result.notes` is empty, tell the writer there's nothing to resolve and stop.

If any notes have `style !== 'curly'`, after resolving them offer a one-line migration prompt:

> I noticed some notes still use the legacy `<…>` or `&lt;…&gt;` format. Run `npx storyline-cli manuscript migrate-markers` to convert them to `{{…}}` in one pass (preview-first). Not required — the scanner still reads them — but future sessions stay cleaner.

## Step 3 — Classify each note

For every entry in `result.notes`, decide which category it falls into:

| Category | Signals | Resolution route |
|---|---|---|
| **Factual lookup** | Real-world specifics: dates, specs, opening hours, geographical facts, historical details, "is X plausible" | Your harness's web-search / web-fetch tools |
| **Plan-consistency** | References characters, beats, earlier chapters, plot threads: "did Jane already own this?", "does this contradict the B story?", "is the midpoint reversal visible here?" | Query odd-flow memory for `chapter:*`, `protagonist:*`, `beats:*`, `plot-thread:*` keys via `mcp__odd-flow__memory_search` |
| **Writer decision** | Open-ended creative choice: "TBD", "XXX", "what's her surname?", "which character says this?" | Flag back to the writer — do not answer. Offer options if obvious, but let them choose. |

## Step 4 — Research / look up

For **factual-lookup** notes:
- Use your harness's web-search tool for queries that need current information (opening hours, recent events, live data). Claude Code exposes this as `WebSearch`; OpenCode as `webfetch` / built-in search; Codex via the web tool.
- Use a page-fetch tool when the writer named a specific source or you need a specific URL.
- Keep answers concise and citable. Prefer two or three candidate facts if variants exist (e.g. "standard opening: 10:00–17:00, late Friday to 20:30 — britishmuseum.org").

For **plan-consistency** notes:
- Query odd-flow for the relevant namespace (`novel:<slug>`) keys.
- If the manuscript contradicts a stored canon (e.g. eye colour mismatch), report the conflict explicitly — do not silently propose the canonical version, because the writer may be intentionally revising canon.

For **writer-decision** notes:
- Do not make a call. Present the note, the surrounding context, and — if helpful — two or three brief options (e.g. "Surname suggestion: Chen, Alvarez, Okafor. Or tell me what you had in mind.").

## Step 5 — Present proposals for approval

Group results into a single message so the writer sees everything at once. Format:

```
📝 Follow-up — manuscript/chapter-03.md

  L12  {{check the British Museum opening times}}
       → Standard 10:00–17:00, late Friday to 20:30
       Replace with: "opened at ten" (concise) | "opened its doors at ten a.m., as it had every day since 1759 except the two world wars" (period-flavoured)

  L47  {{why would a locksmith carry a blowtorch in 1923?}}
       → Factual: blowtorches were used on soldered locks and to anneal wards.
       Replace with: "— the blowtorch he carried for soldered wards — "

  L88  {{what's her surname?}}
       → Writer decision. Suggestions: Chen, Alvarez, Okafor.

  L104 {{does this contradict the B story?}}
       → Plan check: B story is Jane's reconciliation with her sister (per beats:bStory). This passage has Jane refusing to call her — consistent with pre-midpoint Jane. No contradiction.
       Replace with: (keep as prose; remove the marker)

Approve all / approve specific lines / skip?
```

Accept:
- "all" / "yes" — apply every proposed edit.
- "L12, L47" or "1 and 2" — apply only those.
- "skip L88" — everything except that one.
- Freeform counter-proposals — the writer may want different wording; incorporate before applying.

## Step 6 — Apply approved edits in place

For each approved note:

1. Read the target file with your harness's file-read tool.
2. Use your harness's edit-in-place tool to replace the EXACT `raw` string (the full marker including brackets/braces — `{{...}}`, `<...>`, or `&lt;...&gt;`) with the approved replacement. Use a single-occurrence edit — if the same marker appears twice in the file, ask the writer to disambiguate.
3. **Never silently overwrite** — if the file content has moved on since the scan (the writer edited while you were researching), re-scan and re-confirm before editing.

For **writer-decision** notes that the writer resolved inline during the conversation, apply those edits too (treat their answer as the approved replacement).

For notes the writer wants to **keep as open questions**, leave them in place.

## Step 7 — Commit outcomes to memory

After applying edits, capture the research outcomes so a future session can look up "what did we verify for chapter 3?":

```bash
npx storyline-cli manuscript notes --sync    # writes pending-note entries to memory.jsonl
npx storyline-cli memory sync                 # returns pending entries as JSON
```

For each entry returned by `memory sync`:
1. Call `mcp__odd-flow__memory_store` with `{ key, value, namespace, tags }`.
2. Append a second `resolved`-tagged memory entry per resolved note, documenting the finding (e.g. "British Museum hours: 10–17, Fri late to 20:30 — research for chapter 3, line 12").
3. Call `npx storyline-cli memory mark-synced <id1> <id2> ...` for every pushed entry.

## Step 8 — Re-sync the manuscript snapshot

Prose has changed, so manuscript memory is now stale. Refresh it:

```bash
npx storyline-cli manuscript sync
```

This writes `draft:*` keys reflecting new word count, chapter shape, and opening/closing sentences. Push any new pending entries as in Step 7.

## Step 9 — Summarise for the writer

Close with one short message:

```
✓ Resolved 3 of 4 notes in chapter-03.md. 1 open question remaining (L88 — surname).
  Word count: 4,210 → 4,287.
  Memory: 7 new entries synced.
```

## Error handling

- **Scanner returns nothing** — tell the writer the file has no inline notes and stop.
- **Breadcrumb file points to a path that no longer exists** — ignore and fall through to the next resolution step.
- **`mcp__odd-flow__memory_store` unavailable** — apply edits anyway; memory entries stay in `memory.jsonl` and will sync on the next `/storyline` activation. Mention this to the writer once.
- **Scanner finds a false-positive `<...>` match** (angle brackets the writer intentionally used in prose) — the `isProseNote` filter should catch most, but if one slips through, treat it as writer-decision and let the writer veto.

## Guardrails

- Never edit the manuscript without explicit approval for each change (batched approval like "all" counts as explicit).
- Never invent facts for plan-consistency queries — if odd-flow has no matching entry, say so.
- Never push partial edits: if something fails mid-batch, report what was applied and what wasn't so the writer can recover.
- Never modify files outside the resolved scope. If scope was chapter 3 and chapter 5 also has notes, do not touch chapter 5.
