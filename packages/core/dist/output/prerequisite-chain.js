"use strict";
// NF-14.7 — Prerequisite-chain renderer.
//
// Validates the chapter prerequisite graph from an AcademicPlan:
//   - Detects cycles (chapter A → … → A)
//   - Detects forward references (chapter N lists a later chapter as prerequisite)
//   - Emits a topological-order summary and a dependency tree
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePrerequisiteChain = generatePrerequisiteChain;
function generatePrerequisiteChain(plan) {
    const { chapters } = plan;
    const chapterNumbers = chapters.map(c => c.number);
    const prereqMap = {};
    for (const ch of chapters)
        prereqMap[ch.number] = ch.prerequisites;
    // Forward references: chapter N listing a chapter M where M >= N
    const forwardRefs = [];
    for (const ch of chapters) {
        for (const p of ch.prerequisites) {
            if (p >= ch.number) {
                forwardRefs.push({ chapter: ch.number, prereq: p });
            }
        }
    }
    // Cycle detection via DFS with three-colour marking
    // 0 = unvisited, 1 = in-stack, 2 = done
    const colour = {};
    const cycles = [];
    const stack = [];
    function dfs(n) {
        colour[n] = 1;
        stack.push(n);
        for (const p of prereqMap[n] ?? []) {
            if (colour[p] === 1) {
                // Found a back-edge — extract cycle from stack
                const cycleStart = stack.indexOf(p);
                cycles.push([...stack.slice(cycleStart), p]);
            }
            else if (!colour[p]) {
                dfs(p);
            }
        }
        stack.pop();
        colour[n] = 2;
    }
    for (const n of chapterNumbers) {
        if (!colour[n])
            dfs(n);
    }
    // Topological sort (Kahn's algorithm) on acyclic remainder
    const inDegree = {};
    for (const n of chapterNumbers)
        inDegree[n] = 0;
    for (const ch of chapters) {
        for (const p of ch.prerequisites) {
            if (chapterNumbers.includes(p))
                inDegree[ch.number] = (inDegree[ch.number] ?? 0) + 1;
        }
    }
    const queue = chapterNumbers.filter(n => inDegree[n] === 0).sort((a, b) => a - b);
    const topologicalOrder = [];
    while (queue.length) {
        const n = queue.shift();
        topologicalOrder.push(n);
        // Find chapters that depend on n
        for (const ch of chapters) {
            if (ch.prerequisites.includes(n)) {
                inDegree[ch.number]--;
                if (inDegree[ch.number] === 0)
                    queue.push(ch.number);
            }
        }
        queue.sort((a, b) => a - b);
    }
    const chMap = new Map(chapters.map(c => [c.number, c]));
    const unitLabel = plan.bookType === 'revision-guide' ? 'Topic' : 'Chapter';
    const lines = [
        '# Prerequisite Chain',
        '',
        `**Book type:** ${plan.bookType === 'textbook' ? 'Textbook' : 'Revision Guide'}`,
        `**Chapters:** ${chapterNumbers.length}`,
        `**Cycles detected:** ${cycles.length}`,
        `**Forward references:** ${forwardRefs.length}`,
        '',
    ];
    // Topological order summary
    lines.push('## Recommended reading order', '');
    if (topologicalOrder.length === chapterNumbers.length) {
        lines.push(topologicalOrder.map(n => `${unitLabel} ${n}`).join(' → '), '');
    }
    else {
        lines.push('*Could not compute full order — cycle(s) detected. Resolve cycles first.*', '');
    }
    // Dependency tree per chapter
    lines.push('## Dependency map', '');
    for (const n of chapterNumbers) {
        const ch = chMap.get(n);
        if (!ch)
            continue;
        const title = ch.title ?? `${unitLabel} ${n}`;
        const prereqStr = ch.prerequisites.length
            ? ch.prerequisites.map(p => `${unitLabel} ${p}`).join(', ')
            : 'none';
        lines.push(`**${unitLabel} ${n} — ${title}**`);
        lines.push(`  Requires: ${prereqStr}`, '');
    }
    // Forward references
    if (forwardRefs.length > 0) {
        lines.push('## ⚠ Forward references', '');
        lines.push('These chapters list a later chapter as a prerequisite, which means students would need to read ahead.');
        lines.push('');
        for (const fr of forwardRefs) {
            const ch = chMap.get(fr.chapter);
            lines.push(`- **${unitLabel} ${fr.chapter}** (${ch?.title ?? ''}) lists **${unitLabel} ${fr.prereq}** as a prerequisite — but ${unitLabel} ${fr.prereq} comes after`);
        }
        lines.push('');
    }
    // Cycles
    if (cycles.length > 0) {
        lines.push('## ⛔ Cycles detected', '');
        lines.push('Circular dependencies make a valid reading order impossible. Resolve before drafting.');
        lines.push('');
        for (const cycle of cycles) {
            lines.push(`- ${cycle.map(n => `${unitLabel} ${n}`).join(' → ')}`);
        }
        lines.push('');
    }
    return {
        markdown: lines.join('\n').trimEnd() + '\n',
        cycles,
        forwardRefs,
        topologicalOrder,
    };
}
//# sourceMappingURL=prerequisite-chain.js.map