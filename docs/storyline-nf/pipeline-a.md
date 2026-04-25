# Pipeline A — Prescriptive Non-Fiction

Self-help, business, health, money, relationships, productivity. Books where the writer has a system, framework, or method that the reader can apply.

Examples: *Atomic Habits* (Clear), *Deep Work* (Newport), *The 4-Hour Workweek* (Ferriss), *Dare to Lead* (Brown), *The Psychology of Money* (Housel).

## When to choose Pipeline A

Your book:
- Has a named framework, model, or method you're teaching
- Promises the reader a specific transformation ("do X, get Y")
- Is organised around principles, laws, or steps — not events or a story
- Has an identifiable reader who has a problem your method solves

If you're not sure: if a reader could open the book to any chapter and get value, it's probably Pipeline A. If the book has to be read in order to make sense of a narrative, it's Pipeline B.

## The 11 Pipeline A stages

After completing all 12 Book DNA stages:

**1 — Core Thesis (`pa-thesis`)**
The single sentence your whole book is built to prove. Not a topic. Not a title. A claim. *"Systems beat goals because goals end the moment you achieve them."* The thesis determines everything downstream — if it's weak, the book is weak.

**2 — Reader Objections (`pa-objections`)**
Every prescriptive book faces a reader who pushes back. Map the objections now so you can address them structurally — not defensively in footnotes, but architecturally in chapters. Unanswered objections kill trust.

**3 — Framework Design (`pa-framework`)**
Name the model. Design the shape. This stage also determines sub-mode:
- **Argument** — the book is a single sustained argument. Each chapter adds a layer.
- **Braid** — the book interweaves a framework with narrative threads (case study, memoir, investigative). One thread carries the story; one carries the method.

**4 — Principles / Laws (`pa-principles`)**
The components of the framework. Each principle is a chapter candidate. Good principles are specific enough to be falsifiable and general enough to transfer across reader contexts.

**5 — Evidence Map (`pa-evidence`)**
How you'll back each principle. Source types: peer-reviewed research, case studies, personal experience, interviews, historical examples. Evidence Philosophy (from Book DNA Stage 9) sets the tone; this stage operationalises it per principle.

**6 — Application Layer (`pa-application`)**
The "so what?" for the reader. How does each principle change what they do on Monday morning? Application can be exercises, checklists, prompts, or protocols. No application = just theory.

**7 — Narrative Braid (`pa-braid`) — braid mode only**
If you chose the braid sub-mode, this stage designs the narrative thread: who is the protagonist, what is the narrative arc, how does it interleave with the framework chapters? The braid must serve the argument — not just decorate it.

**8 — Chapter Plan (`pa-chapters`)**
Map framework components to chapters. One principle is not automatically one chapter — some need two chapters; some can share. Sequence matters: build the argument in an order that earns trust before it demands belief.

**9 — Opener & Closer Design (`pa-opener`)**
The opener determines whether someone buys the book and reads past chapter one. The closer determines whether they recommend it. Design both before writing either. The opener should hook the reader who doubts the thesis; the closer should leave the reader who believes it with something to do.

**10 — Consistency & Critique (`pa-critique`)**
AI review of the full plan. Checks: thesis supported by all chapters; evidence philosophy consistent with evidence map; reader objections addressed; framework name distinctive; opener earns closer.

**11 — Master Document (`pa-master`)**
Generates `output/<slug>-pipeline-a-master.md` — the full planning document: thesis, framework card data, chapter plan, evidence map, application layer, opener/closer. This is your writing blueprint.

## Sub-mode: Argument vs Braid

At Stage 3 (`pa-framework`), the harness asks which structure fits your book. This forks the stage sequence:

- **Argument**: stages 1–6, 8–11 (pa-braid is skipped)
- **Braid**: stages 1–11 (pa-braid is active)

The sub-mode is stored in project state. You can see it with `storyline nf status`.

## Compile extras (Pipeline A)

When you run `storyline nf compile`:
- **Objection index** — appendix listing reader objections and the chapters that address each
- **Framework Card** — if you ran `storyline nf framework-card`, the PDF is cross-referenced as a companion asset
- **Reader transformation** — optional front-matter promise derived from Book DNA Stage 3

## Common mistakes

- **Thesis that's a topic:** "This book is about habits" is not a thesis. "Identity change precedes behaviour change" is.
- **Framework with no name:** The model needs a name the reader can remember and refer to. "The Four Stages" beats "my four-stage framework."
- **Evidence that only supports:** Good prescriptive books acknowledge counter-evidence and explain why the framework still holds.
- **Opener that summarises:** Don't tell the reader what's in the book. Show them why they need to change.
