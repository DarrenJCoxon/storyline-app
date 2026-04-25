# Pipeline C — How-To / Skill Ladder

Practical skill instruction: cooking, coding, writing craft, language learning, musical instruments, negotiation, physical training. Books where the reader ends with a capability they didn't have at the start.

Examples: *The Joy of Cooking* (Rombauer), *JavaScript: The Good Parts* (Crockford), *The Elements of Style* (Strunk & White), *Fluent in 3 Months* (Lewis), *Mastery* (Greene).

## When to choose Pipeline C

Your book:
- Has a specific, learnable skill as its subject
- Has a measurable end-state: the reader can do something demonstrable
- Is structured as a skill ladder — prerequisites lead to more advanced skills
- Has exercises, drills, or practice activities — not just explanation
- Would feel incomplete without worked examples showing the skill in action

If you're not sure: if a reader could practise what you're teaching in the real world and get measurable better, it's probably Pipeline C. If there's a system but no skill to practise, it might be Pipeline A.

## The 11 Pipeline C stages

After completing all 12 Book DNA stages:

**1 — Target Skill (`pc-skill`)**
The specific, bounded skill the reader will learn. Not "programming" — "writing clean Python functions." Not "cooking" — "executing French knife technique for vegetable prep." Specificity at Stage 1 prevents scope creep through every subsequent stage.

**2 — Reader Starting Level (`pc-start-level`)**
Where the reader begins. Not "beginners" — what do beginners know, what can they already do, and what assumptions can you safely make? The starting level sets the prerequisite floor for every sub-skill in the ladder.

**3 — End-State Competency (`pc-end-state`)**
Where the reader ends up — in measurable terms. "The reader can write a REST API in Python without referring to documentation" is measurable. "The reader understands Python" is not. The end-state must be specific enough that a reader knows when they've reached it.

**4 — Skill Decomposition (`pc-decompose`)**
Break the target skill into every sub-skill required to achieve the end-state. This is not a chapter outline — it's a skills inventory. Each sub-skill is a node in the DAG you'll build at Stage 5. Be exhaustive: missing sub-skills become gaps in the ladder that readers fall through.

**5 — Prerequisite Graph (`pc-prereqs`)**
The dependency map between sub-skills. Sub-skill B requires Sub-skill A means A is a prerequisite of B. This stage generates `.storyline/skill-tree.json` — a validated directed acyclic graph. The harness rejects cycles (you can't require that A prerequisite B and B prerequisite A) and flags orphan sub-skills (skills with no connection to the end-state).

Run `storyline nf skill-tree` to validate and regenerate the graph at any time.

**6 — Lesson Plan (`pc-lessons`)**
Map each sub-skill to a lesson (which will become a chapter or section). Lesson ordering is derived from the prerequisite graph's topological sort — prerequisites always come before the skills that depend on them. The harness suggests an order; you can adjust it as long as prerequisites are respected.

**7 — Exercise / Drill Design (`pc-drills`)**
Concrete practice for each lesson. A drill is not "practise this technique" — it is a specific scenario with a setup, a task, an expected outcome, and the most common mistake. The harness pushes hard for specificity here: vague drills produce vague learning.

**8 — Milestone / Assessment Design (`pc-milestones`)**
Checkpoints where the reader demonstrates accumulated competency before moving to the next phase of the ladder. A milestone is not a quiz — it is a performance task with a specific pass criterion. Milestones prevent readers from proceeding with unresolved gaps.

**9 — Worked Examples & Common Mistakes (`pc-examples`)**
Canonical demonstrations of the skill done correctly, and anti-patterns showing what goes wrong and why. Worked examples are more effective than explanation alone. Common mistakes give readers diagnostic tools when their practice fails.

**10 — Consistency & Critique (`pc-critique`)**
AI review. Checks: end-state measurable; all sub-skills in the skill tree connected to the end-state; drills concrete and specific; milestones have measurable pass criteria; lesson order respects prerequisites; no gaps between starting level and first lesson.

**11 — Master Document (`pc-master`)**
Generates `output/<slug>-pipeline-c-master.md` — skill tree outline, lesson plan, drill catalogue, milestone map, worked examples. Your writing blueprint.

## The skill tree as a data structure

At Stage 5, the harness builds a DAG (Directed Acyclic Graph) stored at `.storyline/skill-tree.json`. Each node is a sub-skill; each edge is a prerequisite relationship. The harness validates:

- **No cycles** — if Skill A requires Skill B and Skill B requires Skill A, the graph is invalid
- **No orphan nodes** — sub-skills with no connections are flagged
- **Reachable end-state** — there must be a path from the start-level through sub-skills to the end-state

Run `storyline nf skill-tree` to validate the graph at any point.

## Compile extras (Pipeline C)

When you run `storyline nf compile`:
- **Skill tree visual** — `output/skill-tree.svg` — the DAG rendered as SVG, embeddable in the book
- **Bibliography** — sources for any research items linked to lessons
- **Fact-check report** — verification status for all research items (relevant if your skill instruction cites studies)

## Common mistakes

- **End-state that's not measurable:** "The reader will understand Python" has no pass criterion. "The reader can write a function, pass arguments, and handle exceptions" does.
- **Skill decomposition that's chapter decomposition:** Sub-skills are not sections of the book — they're the granular components of the target skill. Some sub-skills will share a lesson; some need their own.
- **Drills that are exercises in disguise:** "Write a function using what you've learned" is an exercise. A drill has a specific constraint, a specific expected output, and a specific error to avoid.
- **Milestones that are quizzes:** Multiple-choice questions test recall. A milestone tests performance: can the reader apply the skill under realistic conditions?
- **Prerequisite graph that's a list:** If every sub-skill depends on the one before it and enables only the one after, you have a list, not a graph. Real skill trees have branching paths where some skills are independent of each other.
