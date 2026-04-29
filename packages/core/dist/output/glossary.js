"use strict";
// NF-14.8 — Glossary aggregation.
//
// Aggregates per-chapter key terms from an AcademicPlan into output/glossary.md.
// Terms are deduplicated (case-insensitive), alphabetised, and annotated with
// the first chapter in which they appear.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGlossary = generateGlossary;
function generateGlossary(plan) {
    const unitLabel = plan.bookType === 'revision-guide' ? 'Topic' : 'Chapter';
    // Collect first-mention chapter for each term (case-insensitive dedup)
    const seen = new Map();
    for (const ch of plan.chapters) {
        for (const term of ch.keyTerms) {
            const key = term.toLowerCase().trim();
            if (!seen.has(key)) {
                seen.set(key, { term, firstChapter: ch.number });
            }
        }
    }
    const terms = [...seen.values()].sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));
    const lines = [
        '# Glossary',
        '',
        `**Book type:** ${plan.bookType === 'textbook' ? 'Textbook' : 'Revision Guide'}`,
        `**Total terms:** ${terms.length}`,
        '',
    ];
    if (terms.length === 0) {
        lines.push('*No key terms declared yet.*', '');
    }
    else {
        // Group alphabetically
        let currentLetter = '';
        for (const { term, firstChapter } of terms) {
            const letter = term[0].toUpperCase();
            if (letter !== currentLetter) {
                if (currentLetter)
                    lines.push('');
                lines.push(`### ${letter}`, '');
                currentLetter = letter;
            }
            lines.push(`**${term}** — *(first introduced in ${unitLabel} ${firstChapter})* `);
        }
        lines.push('');
    }
    return { markdown: lines.join('\n').trimEnd() + '\n', terms };
}
//# sourceMappingURL=glossary.js.map