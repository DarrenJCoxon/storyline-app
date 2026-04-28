# NF-14 — Academic category (Textbook & Revision Guide)

*Status: **PROPOSED***
*Parent: [00-overview.md](00-overview.md)*
*Depends on: [NF-11](nf-11-planning-to-writing.md). Benefits from [NF-13](nf-13-figure-planning.md).*
*Created: 2026-04-28*

## Outcome

Storyline supports two academic non-fiction book types — Textbook and Revision Guide — that don't fit Pipeline A/B/C cleanly. An academic project plans against a list of learning outcomes rather than a thesis or a chronology, and its manuscript scaffold seeds chapters with the academic conventions the writer expects: learning outcomes, key terms, worked examples, exercises, summaries, exam-style questions.

## Why this milestone exists

Pipeline A presumes a thesis-and-principles structure. Pipeline B presumes a narrative chronology. Pipeline C presumes a single skill ladder. None of those map well to a GCSE / A-level / undergraduate textbook covering 30 topics across a syllabus, or to a revision guide compressing that material into exam-ready summaries.

Academic books also have a writer profile that overlaps with the user's own context: educators writing alongside teaching, with curriculum constraints, a defined exam objective list, and visual-explanation needs that exceed any other category.

## Scope discipline

Deliberately bounded. NF-14 is **not**:

- a syllabus parser. We do not parse GCSE / A-level / IB / IGCSE specs from PDFs.
- a question-bank generator. We do not generate exam questions.
- a marking scheme. We do not produce model answers.

NF-14 **is**: an academic-shaped chapter and section model the writer fills in, with manuscript scaffolds that match academic publishing conventions.

## Prove-it gate

Four criteria. All must be true.

1. **Academic project type works end-to-end.** A writer can pick "Academic — Textbook" or "Academic — Revision Guide" at project-init and complete planning through to a scaffolded manuscript with academic-shaped chapters.
2. **Manuscript reflects category conventions.** Textbook chapters seed with learning outcomes, key terms, concept explanation, worked examples, exercises, summary. Revision Guide chapters seed with exam objectives, compressed explanation, common misconceptions, quick-check, exam-style questions, summary.
3. **Coverage report.** `output/learning-outcome-coverage.md` shows the writer's declared learning outcomes mapped to chapters. Outcomes with no chapter coverage are flagged.
4. **Tests pass.** NF-14.7 covers Textbook and Revision Guide fixtures end-to-end, scaffold-output discipline, and outcome-coverage flagging.

## Stories

Six stories.

- **NF-14.1 — Academic category in mode gate.** Add Academic as a non-fiction category at project init, with two book-type options: Textbook and Revision Guide. Persist `state.bookType`. *(1 day)*

- **NF-14.2 — Academic Book DNA variant.** A trimmed Book DNA stage list for academic projects: skip the comps deep-dive (academic comps work differently), replace "voice & tone" with "level & register" (KS3 / GCSE / A-level / undergrad / postgrad), add "syllabus or specification reference" as freeform text. *(2 days)*

- **NF-14.3 — Academic chapter-plan stage.** New `ac-chapters` stage. Each chapter: title, learning outcomes covered (writer-declared, freeform list), key terms, sections (concept / worked-example / exercise / summary by default, configurable), word target. *(2 days)*

- **NF-14.4 — `WritingPlan` academic extension.** Extend `getWritingPlan(state)` so academic projects produce a `WritingPlan` with `academic: { learningOutcomes[], keyTerms[], specReference }` and chapters that surface their declared outcomes/terms. *(1 day)*

- **NF-14.5 — Academic manuscript seeding.** Extend NF-11.6 to recognise Textbook and Revision Guide chapters and seed accordingly. Textbook section template: H2 Learning outcomes, H2 Key terms, H2 Concept, H2 Worked example, H2 Exercise, H2 Summary. Revision Guide section template: H2 Exam objectives, H2 Core idea, H2 Common misconceptions, H2 Quick check, H2 Exam-style questions, H2 Summary. *(2 days)*

- **NF-14.6 — Learning-outcome coverage report.** `packages/core/src/output/learning-outcome-coverage.ts` generates `output/learning-outcome-coverage.md`. Lists every declared outcome and the chapters/sections that claim to cover it. Flags outcomes with zero coverage. *(1–2 days)*

- **NF-14.7 — Tests.** New `tests/nf-academic.test.js` covering: (a) Academic project type initialises correctly via the mode gate with `state.bookType` set to `textbook` or `revision-guide`; (b) Book DNA stages skip comps deep-dive and add level/register + spec reference for academic projects; (c) `getWritingPlan(state).academic` populates with declared outcomes and key terms; (d) Textbook chapter scaffolding emits the expected H2 sections (Learning outcomes, Key terms, Concept, Worked example, Exercise, Summary); (e) Revision Guide chapter scaffolding emits its different section template; (f) Coverage report flags outcomes that have zero chapter coverage and lists outcomes that are double-covered. Fixtures: one minimal Textbook project, one minimal Revision Guide project. *(1–2 days)*

## Risks

- **"Academic" is a huge category.** Mitigation: scope locked to two book types. School-textbook and exam-revision shapes cover the highest-volume cases. University-monograph is out of scope; that fits Pipeline A or B.
- **Outcome-mapping accuracy.** Writers may declare outcomes inconsistently. Mitigation: the report shows what was declared, not what's actually demonstrably covered. The coverage check is structural, not semantic.
- **Curriculum-specific drift.** A GCSE textbook differs from an A-level one. Mitigation: keep section templates configurable; ship sensible defaults; let writers edit.

## Out of scope

- Syllabus / specification parsing.
- Question generation.
- Mark-scheme generation.
- Anti-cheat / academic integrity review.
- IB / Cambridge / AQA / OCR / Edexcel-specific templates as separate flows. (Generic templates with writer-editable section structure cover these.)

## Closure

A teacher or academic writer can plan and scaffold a textbook or revision guide in Storyline without forcing it into a thesis-shaped pipeline. The scaffold respects academic conventions; the coverage report tells them whether their plan delivers on the outcomes they promised.
