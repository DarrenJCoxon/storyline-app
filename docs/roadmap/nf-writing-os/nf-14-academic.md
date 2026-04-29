# NF-14 — Academic category (Textbook & Revision Guide)

*Status: **PROPOSED***
*Parent: [00-overview.md](00-overview.md)*
*Requires: [NF-11](nf-11-planning-to-writing.md), [NF-12](nf-12-claim-evidence.md), [NF-13](nf-13-figure-planning.md).*
*Created: 2026-04-28 · Revised: 2026-04-29*

## Outcome

Storyline supports two academic non-fiction book types — **Textbook** and **Revision Guide** — that don't fit Pipeline A/B/C cleanly. An academic project plans against an authoritative outcome inventory (the syllabus or specification the writer is teaching to), captures prerequisite chains and assessment shape, runs the full claim-evidence + figure-planning pipelines, and seeds chapters with the academic conventions the writer expects: learning outcomes, key terms, worked examples, exercises, summaries, exam-style questions. The closure deliverable is a writer who has reached the drafting phase with a complete set of planning artefacts: master document, glossary, figure registry, claim ledger, outcome-coverage report, and exercise/worked-example index.

## Why this milestone exists

Pipeline A presumes a thesis-and-principles structure. Pipeline B presumes a narrative chronology. Pipeline C presumes a single skill ladder. None of those map well to a GCSE / A-level / undergraduate textbook covering 30 topics across a syllabus, or to a revision guide compressing that material into exam-ready summaries.

Academic books also have a writer profile that overlaps with the user's own context: educators writing alongside teaching, with curriculum constraints, a defined exam objective list, citation discipline that exceeds any other category, and visual-explanation needs that exceed any other category. Without a dedicated track, an academic writer would have to bend a thesis-shaped pipeline around a syllabus-shaped book, and would lose the planning rigor (outcome coverage, glossary, prerequisite chain) that academic writing actually demands.

## Scope discipline

Deliberately bounded. NF-14 is **not**:

- a syllabus parser. We do not parse GCSE / A-level / IB / IGCSE specs from PDFs.
- a question-bank generator. We do not generate exam questions.
- a marking scheme. We do not produce model answers.
- an academic-integrity / anti-cheat reviewer.

NF-14 **is**: an academic-shaped planning, research, and writing track the writer drives manually, with structural audits (outcome coverage, prerequisite chain, glossary, figure registry, claim ledger) that verify the plan is internally consistent before drafting begins.

## Prove-it gate

Seven criteria. All must be true.

1. **Academic project type works end-to-end.** A writer can pick "Academic — Textbook" or "Academic — Revision Guide" at project-init and complete planning through to a scaffolded manuscript with academic-shaped chapters.
2. **Manuscript reflects category conventions.** Textbook chapters seed with learning outcomes, key terms, concept explanation, worked examples, exercises, summary. Revision Guide chapters seed with exam objectives, compressed explanation, common misconceptions, quick-check, exam-style questions, summary. Worked examples and exercises carry stable numbered IDs (e.g. `ex-3.2`, `we-4.1`) usable as cross-references.
3. **Authoritative outcome inventory drives coverage.** The writer declares the full syllabus / specification outcome list once at the top level. The coverage report compares per-chapter declared outcomes against this authoritative inventory and flags both zero-coverage and double-coverage outcomes.
4. **Prerequisite chain is captured and visualised.** Chapters declare prerequisite chapters; the master doc renders the dependency order and flags forward-references (a chapter relying on material introduced later).
5. **Research and visual pipelines integrate cleanly.** NF-12 claim/evidence ledger and NF-13 figure registry both work for academic projects. Citations flow through worked examples; figures flow through concept explanations.
6. **Closure artefacts are complete.** On planning completion, the writer has: `output/master-document.md` (academic shape), `output/glossary.md`, `output/learning-outcome-coverage.md`, `output/exercise-index.md`, `output/figure-registry.md`, `output/claim-evidence-ledger.md`, plus seeded manuscript files.
7. **Tests pass.** NF-14.10 covers Textbook and Revision Guide fixtures end-to-end, scaffold-output discipline, outcome-coverage flagging (including double-coverage), prerequisite-chain detection, glossary aggregation, exercise indexing, and academic master-doc rendering.

## Stories

Ten stories. Roughly two phases — planning (.1–.4), research/writing infrastructure (.5–.9), tests (.10).

### Planning

- **NF-14.1 — Academic category in mode gate.** Add Academic as a non-fiction category at project init, with two book-type options: Textbook and Revision Guide. Persist `state.bookType` as `'textbook' | 'revision-guide'`. Route to academic stage list. *(1 day)*

- **NF-14.2 — Academic Book DNA variant.** A trimmed Book DNA stage list for academic projects: skip the comps deep-dive (academic comps work differently), replace "voice & tone" with "level & register" (KS3 / GCSE / A-level / IB / undergrad / postgrad), add "syllabus or specification reference" as freeform text (e.g. "AQA GCSE Physics 8463"), capture assessment shape (essay / multi-step calc / MCQ / extended response / mixed). *(2 days)*

- **NF-14.3 — `ac-syllabus` outcome-inventory stage (NEW).** Top-level stage where the writer declares the authoritative outcome list — the syllabus or spec they are teaching to. Each outcome has: code (writer-defined, e.g. `LO-3.2.1`), text, and optional bloom-level tag. This is the source of truth coverage reports check against; per-chapter declared outcomes are validated as a subset of it. *(2 days)*

- **NF-14.4 — Academic chapter-plan stage.** New `ac-chapters` stage. Each chapter: title, learning outcomes covered (selected from the syllabus inventory, with free-text fallback), key terms, prerequisite chapter numbers, sections (concept / worked-example / exercise / summary by default, configurable), word target. Worked examples and exercises declared as structured items with stable IDs (`we-{chapter}.{n}`, `ex-{chapter}.{n}`) and difficulty tags. *(3 days)*

### Research and writing infrastructure

- **NF-14.5 — `WritingPlan` academic extension.** Extend `getWritingPlan(state)` so academic projects produce a `WritingPlan` with `academic: { bookType, level, specReference, assessmentShape, learningOutcomes[], keyTerms[], workedExamples[], exercises[], prerequisites: Map<chapter, chapter[]> }` and chapters that surface their declared outcomes/terms/prerequisites. Mode-agnostic: non-academic plans return `academic: null`. *(2 days)*

- **NF-14.6 — Academic manuscript seeding.** Extend NF-11.6 to recognise Textbook and Revision Guide chapters and seed accordingly. Textbook section template: H2 Learning outcomes, H2 Key terms, H2 Concept, H2 Worked example (with `{{example: we-X.Y}}` markers), H2 Exercise (with `{{exercise: ex-X.Y}}` markers), H2 Summary. Revision Guide section template: H2 Exam objectives, H2 Core idea, H2 Common misconceptions, H2 Quick check, H2 Exam-style questions, H2 Summary. NF-12 `{{claim:}}` markers seed under concept/worked-example. NF-13 `{{figure:}}` markers seed where the chapter declares figures. *(2 days)*

- **NF-14.7 — Learning-outcome coverage + prerequisite-chain reports.** `packages/core/src/output/learning-outcome-coverage.ts` generates `output/learning-outcome-coverage.md` from the authoritative `ac-syllabus` outcome list, mapping each outcome to the chapters/sections that claim coverage. Flags zero-coverage outcomes (gaps) and double-coverage outcomes (potential redundancy). A second renderer, `prerequisite-chain.ts`, validates the prerequisite graph: detects cycles, flags forward-references, emits a topological order summary into the academic master doc. *(2 days)*

- **NF-14.8 — Glossary + exercise/worked-example index.** `packages/core/src/output/glossary.ts` aggregates per-chapter key terms into `output/glossary.md`, deduplicated, alphabetised, with first-mention chapter reference. `packages/core/src/output/exercise-index.ts` produces `output/exercise-index.md` listing all worked examples and exercises by chapter, with difficulty distribution and a flag if a chapter is missing exercises entirely (for textbooks) or exam-style questions (for revision guides). *(2 days)*

- **NF-14.9 — Academic master document.** Extend `nf-master-doc.ts` (or new `ac-master-doc.ts`) for academic shape. Sections: Book DNA + level/register + spec reference, Outcome inventory, Outcome coverage summary, Prerequisite chain, Glossary preview, Chapter plan with declared outcomes/terms/figures/exercises, Figure registry summary (NF-13), Claim risk overview (NF-12), Exercise index summary. Required NF-12 claim ledger and NF-13 figure registry are linked, not optional. *(2 days)*

### Tests

- **NF-14.10 — Tests.** New `tests/nf-academic.test.js` covering:
  - (a) Academic project type initialises correctly via the mode gate with `state.bookType` set to `textbook` or `revision-guide`.
  - (b) Book DNA stages skip comps deep-dive and add level/register, spec reference, assessment shape for academic projects.
  - (c) `ac-syllabus` outcome inventory persists with codes and is the authoritative list.
  - (d) `getWritingPlan(state).academic` populates with declared outcomes, key terms, worked examples, exercises, and prerequisite map.
  - (e) Textbook chapter scaffolding emits the expected H2 sections (Learning outcomes, Key terms, Concept, Worked example, Exercise, Summary) with stable `{{example:}}` and `{{exercise:}}` markers.
  - (f) Revision Guide chapter scaffolding emits its different section template.
  - (g) Coverage report flags zero-coverage outcomes and lists double-covered outcomes.
  - (h) Prerequisite-chain renderer detects cycles and forward-references.
  - (i) Glossary deduplicates terms and emits alphabetical first-mention references.
  - (j) Exercise index lists items with difficulty distribution and flags chapters missing exercises.
  - (k) Academic master doc surfaces outcome coverage, prerequisite chain, glossary preview, figure-registry summary, and claim risk overview in a single render.
  - (l) NF-12 `{{claim:}}` and NF-13 `{{figure:}}` markers appear in academic manuscript scaffold.
  - Fixtures: one minimal Textbook project (GCSE Physics, 4 chapters, 12 outcomes, prerequisites, figures, claims), one minimal Revision Guide project (A-level History, 3 topics, exam objectives, misconceptions). *(2–3 days)*

## Risks

- **"Academic" is a huge category.** Mitigation: scope locked to two book types. School-textbook and exam-revision shapes cover the highest-volume cases. University-monograph is out of scope; that fits Pipeline A or B.
- **Outcome-mapping accuracy.** Writers may declare outcomes inconsistently. Mitigation: the syllabus inventory acts as the authoritative list; chapter declarations are validated against it; the report shows structural coverage, not semantic accuracy.
- **Prerequisite-graph complexity.** Maths/science textbooks can have tangled dependencies. Mitigation: cycle detection and forward-reference flagging are advisory, not blocking. Writer can override.
- **Curriculum-specific drift.** A GCSE textbook differs from an A-level one. Mitigation: keep section templates configurable; ship sensible defaults; let writers edit.
- **Story count creeping the milestone.** Ten stories versus the original six. Mitigation: each new story is small and slots into existing infrastructure (NF-11/-12/-13). The total estimate is ~21 days, in line with FIC-D and NF-11.

## Out of scope

- Syllabus / specification parsing from PDFs.
- Question generation.
- Mark-scheme generation.
- Anti-cheat / academic-integrity review.
- Bloom's-taxonomy auto-tagging (writer declares manually if at all).
- IB / Cambridge / AQA / OCR / Edexcel-specific templates as separate flows. Generic templates with writer-editable section structure cover these.
- University-monograph / research-monograph shape (use Pipeline A or B).

## Closure

A teacher or academic writer can plan, research, and reach drafting for a textbook or revision guide in Storyline without forcing it into a thesis-shaped pipeline. The scaffold respects academic conventions; the syllabus inventory plus coverage report verifies the plan delivers on the outcomes promised; the prerequisite chain confirms internal consistency; the glossary, figure registry, claim ledger, and exercise index ship as first-class planning artefacts. The writer enters the drafting phase with the same artefact density a fiction writer gets from FIC-D — but shaped for academic publishing.
