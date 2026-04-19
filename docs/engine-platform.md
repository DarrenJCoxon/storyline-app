# The Engine Platform — One VS Code Extension, Many Writing Forms

_Status: design sketch. Not yet built._
_Depends on: [vscode-extension.md](vscode-extension.md), [compile-feature.md](compile-feature.md)._
_Last updated: 2026-04-19_

## The insight

What we've been designing isn't "a novel-writing tool." It's a **writing platform** — a VS Code extension that provides the *common substrate* every long-form writer needs (rich-text editor, file management, AI harness panel, compile pipeline) — with **pluggable engines** that specialise for different writing forms.

Novel Writer is the first engine. It's not the whole product.

## Why this matters

Every writing form has the same core needs and different domain requirements.

**Universal needs (the platform provides):**
- A rich-text editor that saves to markdown
- A file tree for organising the work
- An AI harness panel for conversation-driven planning/critique
- A compile pipeline to publishable output
- Word count, progress tracking, goals

**Form-specific needs (the engine provides):**
- What structure does good work in this form have?
- What should the planning conversation cover?
- What critique heuristics apply?
- What output formats make sense?
- What conventions does the form follow (format, style, length)?

A novelist and an essayist need completely different planning conversations but the same rich-text editor, the same markdown files, the same compile-to-PDF option. Separating the platform from the engine lets us serve multiple writer populations without rebuilding the substrate each time.

## Engines worth building

**Novel Writer** (already built as a CLI + skill; this is the first engine)
- Save the Cat planning: wound, flaw, lie, want, need, 15 beats
- Character-first development
- Compile to EPUB + print PDF

**Essay Writer** (academic, argumentative)
- Thesis → argument structure → evidence → counter-argument → rebuttal planning
- Source management (citations, bibliography)
- Critique for logical fallacies, weak evidence, unsupported claims
- Compile to Word docx (APA/MLA/Chicago), PDF for submission

**Non-Fiction Writer** (how-to, business, educational)
- Outcome-led structure (what will the reader know/do after each chapter?)
- Chapter-as-lesson framing
- Companion materials (workbooks, exercises, checklists)
- Compile to EPUB, print PDF, companion PDFs, web HTML course format

**Screenplay Writer**
- Three-act structure with genre variants
- Character arcs, relationship triangulation
- Scene heading / action / dialogue discipline
- Compile to industry-format PDF (Courier 12pt, specific margins), Final Draft `.fdx`

**Short Story Writer**
- Shorter beat structures (Freytag, 5-act, modernist)
- Magazine / journal submission workflows
- Compile to Shunn manuscript format (the standard submission template)

**Memoir / Personal Essay Writer**
- Scene-based memory work, emotional arc mapping
- Truth-vs-dramatic-structure tension
- Sensitive-content flagging

**Poetry** (probably out of scope — different enough that the platform's assumptions don't fit cleanly)

## What the platform provides

Concretely, the VS Code extension ships these capabilities regardless of engine:

1. **Rich-text editor** — TipTap webview, markdown on disk, scene/section break custom nodes, word count
2. **Custom tree view** — Scrivener-style "binder" showing manuscript organisation (engine decides what groupings exist: chapters/scenes for novels, sections/sub-sections for non-fiction, acts/scenes for screenplays)
3. **AI harness panel** — Claude Code chat integration; engines provide their own planning flow via the existing skill pattern
4. **Compile pipeline** — engine-agnostic assembly, theme application, output rendering (see compile-feature.md)
5. **State management** — the `.novel-writer/state.json` pattern, but generalised per-engine
6. **Memory sync** — the durable jsonl + odd-flow MCP sync pattern
7. **Pre-flight validation** — file format, metadata, platform-specific requirements

An engine doesn't reinvent any of this. It just plugs in.

## What an engine provides

An engine is a bundle of:

1. **A Claude Code skill** — the planning conversation (today's `skill/SKILL.md` for Novel Writer)
2. **A state schema** — what data gets tracked through planning (today's `lib/state/project-state.js`)
3. **A CLI** — stage management, state persistence, memory writing (today's `bin/novel-writer.js`)
4. **Planning stages** — the ordered sequence of planning steps
5. **Critique heuristics** — form-specific rules (today's `lib/ai/story-traps.js`, `lib/ai/coaching-personas.js`)
6. **Compile templates** — front/back matter, chapter-heading style, theme set for the form
7. **Tree view groupings** — how manuscript files are organised in the binder
8. **Output format list** — which compile targets make sense for this form

Everything an engine needs fits in a single npm package. Writers install the engine(s) they care about; the extension detects installed engines and activates the right one based on the project type.

## Engine detection

Easiest path: a `.writing-project.json` at the project root declares which engine is active.

```json
{
  "engine": "novel-writer",
  "engineVersion": "1.0.0"
}
```

When the extension opens a folder, it looks for this file. If present, the extension activates the right engine (loads its skill, its state schema, its compile templates). If absent, it prompts the writer to pick one, and writes the config.

Multiple engines can coexist on a machine. A writer can have `/books`, `/essays`, and `/scripts` folders each running a different engine.

## The naming question

"Novel Writer" is a specific engine. The platform needs its own name. Options:

- **Manuscript** — neutral, covers all long-form forms
- **Longform** — explicit about the target
- **Compose** — active, verb-y
- **Atelier** — pretentious but memorable (writers' workshop / artist's studio)
- **Forge** — too developer-y

Worth deciding later — premature naming commits us to marketing before we know the product. For now: "the platform" works fine in docs.

## The engine API boundary

What must an engine implement? Rough sketch of the contract:

```typescript
interface WritingEngine {
  id: string;                          // "novel-writer"
  name: string;                        // "Novel Writer"
  description: string;
  version: string;

  skill: SkillDefinition;              // The /command skill for planning

  stateSchema: JSONSchema;             // What the engine's state.json looks like

  cli: {                               // CLI commands the skill calls
    binary: string;                    // "nw"
    commands: CLICommand[];
  };

  stages: PlanningStage[];             // Ordered planning stages

  critique: {                          // Form-specific critique hooks
    traps: TrapDetector[];
    personas: CoachingPersona[];
  };

  binder: {                            // How to group files in the tree view
    groupBy: (files: FileMeta[]) => BinderNode[];
  };

  compile: {                           // Compile capabilities
    formats: OutputFormat[];           // "epub", "print-pdf-6x9", "docx-agent"...
    themes: Theme[];                   // Available themes for this engine
    frontMatter: FrontMatterSection[];
    backMatter: BackMatterSection[];
    preflightRules: PreflightRule[];
  };
}
```

Nothing here is novel — it's the existing Novel Writer code generalised to be one implementation of an interface. The refactor is: extract the platform bits out of `novel-writer`, leave the novel-specific bits in a `novel-writer-engine` package.

## Refactor path (from current Novel Writer code)

The current repo mixes platform and engine concerns because until today we thought "Novel Writer" was the whole product. The split:

**Platform (new package, extract from current code):**
- `lib/state/` — generalise from novel-specific to engine-agnostic
- `lib/memory/` — already engine-agnostic, move as-is
- `lib/output/master-doc.js` — generalise (themes per engine)
- `lib/output/stage-doc.js` — generalise (stage names from engine)
- VS Code extension itself (new)
- Compile pipeline (new, see compile-feature.md)

**Novel Writer engine (rename current repo):**
- `lib/ai/stage-guides.js` — novel-specific planning stages
- `lib/ai/coaching-personas.js` — novel-specific personas
- `lib/ai/story-traps.js` — novel-specific traps
- `lib/ai/narrative-voice.js` — Save the Cat knowledge
- `lib/ai/series-detector.js` — novel-specific
- `skill/SKILL.md` — the /novel command
- Novel-specific state shape (protagonist, beats, etc)
- Novel-specific compile themes (Classic Serif etc)

The split is mostly mechanical. Today's `novel-writer` is about 70% engine-specific, 30% platform. Extracting the platform gives us the substrate; adding new engines becomes roughly as much work as the current Novel Writer was.

## Business model implications

Platform + engines changes the commercial picture substantially.

**Option A: open source everything, monetise compile.**
- Platform is free, engines are free
- Compile pipeline is free but hosted compile (for writers who want PDF rendering in the cloud) is paid
- Works if compile PDF becomes the bottleneck feature

**Option B: open source platform, paid engines.**
- Platform free, each engine $X or $Y/month
- Writers pay for the form(s) they use
- Novelists don't subsidise non-fiction authors and vice versa

**Option C: platform + first-party engines free, third-party marketplace.**
- We provide the platform and a few engines
- Third-party developers can publish engines (playwright, lyricist, technical writer)
- Marketplace takes a cut
- Long-term: becomes an ecosystem, not a product

**Option D: freemium.**
- Free tier: one engine, one compile format, one project
- Paid: unlimited engines, all compile formats, unlimited projects

These are decisions for much later. Point is: the platform-plus-engines architecture opens strategies that "one app for one form" doesn't.

## What this means for the current Novel Writer work

Immediate: **nothing changes.** Don't refactor yet. Finish Novel Writer as a functional CLI + skill. Use it to plan and write a real book. Learn what the engine needs to expose.

Once one engine works end-to-end (plan → write → compile → publish), the generalisation becomes obvious. Trying to design the platform abstractly before any engine is complete is exactly the kind of premature architecture that kills products.

The right sequence:
1. Finish Novel Writer (planning harness + compile pipeline for novels)
2. Build the VS Code extension with TipTap, hardcoded for novels
3. Use it to write a real book end-to-end
4. Notice what's novel-specific vs what's general
5. Start a second engine (probably Non-Fiction, since you already write for that form)
6. The duplication between them reveals the platform boundary
7. Extract

Don't skip step 3. The abstraction is only correct if it's informed by at least two real implementations.

## Risks & open questions

**Premature generalisation.** The biggest risk is building the platform before the first engine works. Platforms without engines are vapourware. Build the engine, prove it, *then* abstract.

**Engine drift.** If engines develop independently, they'll develop incompatible conventions. The platform needs strong opinions about things like state file format, compile output directory, how engines integrate with the binder. A written engine API (even if informal) helps.

**Which engines actually have market?** Novel-writing is proven (Scrivener market). Non-fiction is proven (writers use Scrivener for it too). Essays and screenplays have their own tools already (Word / Final Draft). Worth being honest about whether an Essay Writer engine is solving a real pain or just filling a matrix slot.

**Cross-engine features.** What if a writer wants a novelist-style beat sheet for their non-fiction book's narrative chapters? Or a screenplay-style scene breakdown for a novel? Some features will want to be shared across engines. Plan for "engine extensions" or "modules" to avoid forcing engines to duplicate shared logic.

**The extension becomes a monolith.** If it bundles multiple engines, it gets heavy. Prefer engines as separate npm packages installed on-demand, so writers only carry what they use.

## Next steps

Nothing to do right now. This doc exists to capture the insight before it evaporates. When the time comes (after Novel Writer is working end-to-end and the VS Code extension prototype has been built), this doc becomes the guide for the refactor.

The single most important thing this doc says: **one engine working real-world is worth more than three engines designed on paper.** Don't start the platform work until Novel Writer ships.
