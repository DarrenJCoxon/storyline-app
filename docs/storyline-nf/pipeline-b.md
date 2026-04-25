# Pipeline B — Narrative Non-Fiction

Popular science, history, investigative journalism, true crime, biography, nature writing. Books where a true story or a body of ideas is the vehicle for insight.

Examples: *Sapiens* (Harari), *The Immortal Life of Henrietta Lacks* (Skloot), *Educated* (Westover), *The Sixth Extinction* (Kolbert), *In Cold Blood* (Capote), *Thinking, Fast and Slow* (Kahneman).

## When to choose Pipeline B

Your book:
- Has real people, real events, or a body of scientific/historical evidence as its primary material
- Has a central question the narrative exists to answer, not a framework to teach
- Would be harder to read out of order — events build, arguments layer, revelations land
- Is reported, researched, or reconstructed — not primarily instructional

If you're not sure: if the book's power comes from what happened or what is true, it's probably Pipeline B. If the power comes from a system the reader can apply, it's Pipeline A.

## The 10 Pipeline B stages

After completing all 12 Book DNA stages:

**1 — Central Question / Thesis (`pb-thesis`)**
The driving question the book exists to answer. Not just a topic — a question with a stake. *"Why did the Aztec empire collapse so quickly?"* or *"What does it mean to be human in an age of genetic engineering?"* The question should be answerable but not trivially so.

**2 — Cast of Real People (`pb-cast`)**
Every narrative NF book has key figures. Document them here: name, role, relationship to the central question, chapter prominence. This becomes your cast dossier — a reference you'll return to while drafting to keep characterisation consistent.

**3 — Timeline (`pb-timeline`)**
The raw chronological spine. All key events in order, with dates where known. This stage generates `.storyline/timeline.json` and `timeline.md`. The timeline is not the book's structure — it's the raw material you'll rearrange. Identify the pivot moment: the event that makes the central question unavoidable.

**4 — Structural Fork (`pb-fork`)**
Narrative NF has two primary shapes:
- **Idea-led** — the book is organised around ideas, arguments, or themes. Events serve ideas. (Sapiens, Thinking Fast and Slow)
- **Event-led** — the book follows events in roughly chronological order. Ideas emerge from events. (In Cold Blood, The Immortal Life)

This choice drives everything downstream: scene sequencing, chapter architecture, sourcing register.

**5 — Scene List (`pb-scenes`)**
The key narrative moments — scenes where the reader sees, hears, or follows someone through an event. Not every scene is in every Pipeline B book; some are more essayistic. But even idea-led books have scenes. Map the scenes that will carry the most emotional or intellectual weight.

**6 — Sourcing Register (`pb-sourcing`)**
Every claim that needs a source. This is a filtered view over the research subsystem — items with `subtype: sourced-claim`. Run `storyline nf sourcing-register` to build it from your research captures. At compile time, this becomes your endnotes.

**7 — Thematic Through-Line (`pb-theme`)**
The idea that the narrative keeps returning to. Not the central question — the central question is what the book is about. The through-line is the lens it applies. *The Immortal Life* asks "what happened to Henrietta Lacks?" but applies the lens of bodily autonomy and exploitation. Theme is what makes a book resonate beyond its story.

**8 — Chapter Outline (`pb-chapters`)**
Map the narrative structure to chapters. In event-led books: roughly chronological, with flashbacks and flash-forwards marked. In idea-led books: one idea per chapter, with the narrative evidence that supports it. The outline should make the through-line visible — a reader scanning chapter titles should feel the arc.

**9 — Consistency & Critique (`pb-critique`)**
AI review. Checks: central question answered by the book's arc; cast introduction timing; timeline coherence; sourcing register against chapter map (chapters with many claims, few sources flagged); theme visible in chapter structure.

**10 — Master Document (`pb-master`)**
Generates `output/<slug>-pipeline-b-master.md` — cast dossiers, timeline table, scene list, sourcing register, chapter outline. Your writing blueprint.

## Sub-mode: Idea-led vs Event-led

At Stage 4 (`pb-fork`), the harness asks which shape fits your book. This informs:
- Scene sequencing logic (event-led: chronological by default; idea-led: thematic)
- Chapter architecture guidance
- Critique checks (event-led books are checked for pacing; idea-led for argument structure)

## Compile extras (Pipeline B)

When you run `storyline nf compile`:
- **Bibliography** — all research items formatted in Chicago (default), APA, or MLA
- **Endnotes** — per-chapter notes pulled from linked research items
- **Timeline visual** — `output/timeline.svg` — the full timeline rendered as SVG, embeddable in the book
- **Fact-check report** — `output/fact-check-report.md` — verification status for all research items

## Common mistakes

- **Central question that's too broad:** "What is consciousness?" is a PhD dissertation, not a book. "What does the latest neuroscience tell us about why people change their minds?" is a book.
- **Timeline that's the structure:** The timeline is the raw material. The book's structure is what you do with it.
- **Cast without reader anchors:** If the reader can't remember who's who by chapter 3, the book has a cast problem. Introduce characters through action, not biography.
- **Sourcing that stops at Google:** Pipeline B books stand or fall on source quality. Primary sources, interviews, and peer-reviewed research outweigh secondary sources in the sourcing register.
