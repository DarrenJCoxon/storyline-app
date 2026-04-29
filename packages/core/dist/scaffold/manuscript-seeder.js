"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANUSCRIPT_SEED_MARKER = void 0;
exports.seedChapterContent = seedChapterContent;
exports.chapterManuscriptPath = chapterManuscriptPath;
exports.nfChapterManuscriptPath = nfChapterManuscriptPath;
exports.seedNfChapterContent = seedNfChapterContent;
exports.seedAcademicChapterContent = seedAcademicChapterContent;
exports.seedManuscriptFromPlan = seedManuscriptFromPlan;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Marker written at the top of every seeded manuscript file. Its presence
// indicates the file has not been modified by the writer — safe to overwrite
// (e.g. when new contract fields are captured after initial seeding).
exports.MANUSCRIPT_SEED_MARKER = '<!-- storyline:seed:v1 -->';
const BEAT_NAMES = {
    beat01OpeningImage: 'Opening Image',
    beat02Setup: 'Setup',
    beat03Catalyst: 'Catalyst',
    beat04Debate: 'Debate',
    beat05BreakIntoTwo: 'Break Into Two',
    beat06BStory: 'B Story',
    beat07FunAndGames: 'Fun and Games',
    beat08Midpoint: 'Midpoint',
    beat09BadGuysCloseIn: 'Bad Guys Close In',
    beat10AllIsLost: 'All Is Lost',
    beat11BlackMoment: 'Black Moment',
    beat12Beat13: 'Break Into Three',
    beat13Finale: 'Finale',
    beat14FinalImage: 'Final Image',
    beat15EndCredits: 'End Credits',
};
function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
function pad(n) {
    return String(n).padStart(2, '0');
}
function contractLine(label, value) {
    return `*${label}: ${value ?? '(not yet planned)'}*`;
}
function seedSceneBlock(sc, isLast) {
    const sTitle = sc.summary ? ` — ${sc.summary}` : '';
    const lines = [`## Scene ${sc.sceneNumber}${sTitle}`, ''];
    const meta = [];
    if (sc.pov)
        meta.push(`POV: ${sc.pov}`);
    if (sc.location)
        meta.push(`Location: ${sc.location}`);
    if (sc.timeOfDay)
        meta.push(`Time: ${sc.timeOfDay}`);
    if (meta.length)
        lines.push(`> *${meta.join(' · ')}*`, '');
    lines.push(contractLine('Goal', sc.goal), contractLine('Obstacle', sc.obstacle), contractLine('Stakes', sc.stakes), contractLine('Turn', sc.storyTurn));
    if (sc.valueShiftStart !== undefined || sc.valueShiftEnd !== undefined) {
        lines.push(`*Value shift: ${sc.valueShiftStart ?? '?'} → ${sc.valueShiftEnd ?? '?'}*`);
    }
    if (sc.estimatedWords) {
        lines.push('', `*Target: ~${sc.estimatedWords.toLocaleString()} words*`);
    }
    lines.push('', '<!-- Write your prose below -->', '', '');
    if (!isLast)
        lines.push('---', '');
    return lines;
}
function seedChapterContent(ch) {
    const title = ch.chapterTitle ?? `Chapter ${ch.chapterNumber}`;
    const beatName = ch.beat ? (BEAT_NAMES[ch.beat] ?? ch.beat) : null;
    const lines = [exports.MANUSCRIPT_SEED_MARKER, '', `# Chapter ${ch.chapterNumber} — ${title}`, ''];
    if (beatName)
        lines.push(`> *Beat: ${beatName}*`, '');
    if (ch.scenes.length === 0) {
        lines.push('*No scenes planned yet. Return after the chapter flesh-out stage.*', '');
        return lines.join('\n').trimEnd() + '\n';
    }
    for (let i = 0; i < ch.scenes.length; i++) {
        lines.push(...seedSceneBlock(ch.scenes[i], i === ch.scenes.length - 1));
    }
    return lines.join('\n').trimEnd() + '\n';
}
function chapterManuscriptPath(ch) {
    const slug = slugify(ch.chapterTitle ?? `chapter-${ch.chapterNumber}`);
    const filename = slug ? `${pad(ch.chapterNumber)}-${slug}.md` : `${pad(ch.chapterNumber)}.md`;
    return path.join('manuscript', filename);
}
function isSeedFile(content) {
    return content.trimStart().startsWith(exports.MANUSCRIPT_SEED_MARKER);
}
// ── NF seeding (NF-11.6) ─────────────────────────────────────────────────────
function nfChapterManuscriptPath(ch) {
    return ch.manuscriptFile;
}
function seedNfChapterContent(ch, claims = [], figures = []) {
    const num = ch.number ?? 1;
    const title = ch.title ?? `Chapter ${num}`;
    const lines = [exports.MANUSCRIPT_SEED_MARKER, '', `# Chapter ${num} — ${title}`, ''];
    if (ch.mission)
        lines.push(`> *${ch.mission}*`, '');
    if (ch.linkedPrinciple)
        lines.push(`> *Principle: ${ch.linkedPrinciple}*`, '');
    if (ch.chapterQuestion)
        lines.push(`> *Question: ${ch.chapterQuestion}*`, '');
    if (ch.learningObjective)
        lines.push(`> *Objective: ${ch.learningObjective}*`, '');
    if (ch.wordCountEstimate)
        lines.push(`> *Target: ~${Number(ch.wordCountEstimate).toLocaleString()} words*`, '');
    if (ch.sections.length === 0) {
        lines.push('*No sections planned yet. Return after the chapter-plan stage.*', '');
        return lines.join('\n').trimEnd() + '\n';
    }
    const chapterClaims = claims.filter(c => c.chapterNumber === ch.number);
    const chapterFigures = figures.filter(f => f.chapterNumber === ch.number);
    for (let i = 0; i < ch.sections.length; i++) {
        const sec = ch.sections[i];
        lines.push(`## ${sec.title}`, '');
        if (sec.notes)
            lines.push(`*Section purpose: ${sec.notes}*`, '');
        if (sec.keyResearch)
            lines.push(`{{research: ${sec.keyResearch}}}`, '');
        // NF-12.3: emit {{claim: <id>}} markers in evidence sections
        if (sec.type === 'evidence') {
            for (const c of chapterClaims)
                lines.push(`{{claim: ${c.id}}}`, '');
        }
        // NF-13.3: emit {{figure: <id>}} markers where section title matches, or in first section
        const sectionFigures = chapterFigures.filter(f => f.sectionTitle ? f.sectionTitle === sec.title : i === 0);
        for (const f of sectionFigures)
            lines.push(`{{figure: ${f.id}}}`, '');
        lines.push('<!-- Write your prose below -->', '', '');
        if (i < ch.sections.length - 1)
            lines.push('---', '');
    }
    return lines.join('\n').trimEnd() + '\n';
}
// ── Academic seeding (NF-14.6) ───────────────────────────────────────────────
/** Seed a textbook chapter: Learning outcomes / Key terms / Concept /
 *  Worked example (one H3 per item with {{example:}} marker) / Exercise
 *  (one H3 per item with {{exercise:}} marker) / Summary. */
function seedTextbookChapterContent(nfCh, acCh, claims, figures) {
    const num = nfCh.number ?? acCh.number;
    const title = nfCh.title ?? acCh.title ?? `Chapter ${num}`;
    const lines = [exports.MANUSCRIPT_SEED_MARKER, '', `# Chapter ${num} — ${title}`, ''];
    if (acCh.wordTarget)
        lines.push(`> *Target: ~${acCh.wordTarget.toLocaleString()} words*`, '');
    if (acCh.prerequisites.length) {
        lines.push(`> *Prerequisites: ${acCh.prerequisites.map(n => `Ch ${n}`).join(', ')}*`, '');
    }
    // Learning outcomes
    lines.push('## Learning outcomes', '');
    if (acCh.outcomes.length) {
        for (const code of acCh.outcomes)
            lines.push(`- ${code}`);
        lines.push('');
    }
    else {
        lines.push('*No outcomes declared yet.*', '');
    }
    // Key terms
    lines.push('## Key terms', '');
    if (acCh.keyTerms.length) {
        for (const term of acCh.keyTerms)
            lines.push(`- **${term}** —`);
        lines.push('');
    }
    else {
        lines.push('*No key terms declared yet.*', '');
    }
    // Concept (with claim + figure markers)
    lines.push('## Concept', '');
    const chapterClaims = claims.filter(c => c.chapterNumber === num);
    const chapterFigures = figures.filter(f => f.chapterNumber === num);
    for (const c of chapterClaims)
        lines.push(`{{claim: ${c.id}}}`, '');
    for (const f of chapterFigures)
        lines.push(`{{figure: ${f.id}}}`, '');
    lines.push('<!-- Write your concept explanation here -->', '');
    // Worked examples
    lines.push('## Worked example', '');
    if (acCh.workedExamples.length) {
        for (const we of acCh.workedExamples) {
            const weTitle = we.title ?? we.id;
            const diff = we.difficulty ? ` *(${we.difficulty})*` : '';
            lines.push(`### ${we.id} — ${weTitle}${diff}`, '');
            lines.push(`{{example: ${we.id}}}`, '');
            lines.push('<!-- Write the worked example here -->', '');
        }
    }
    else {
        lines.push('*No worked examples declared yet.*', '');
    }
    // Exercises
    lines.push('## Exercise', '');
    if (acCh.exercises.length) {
        for (const ex of acCh.exercises) {
            const exTitle = ex.title ?? ex.id;
            const diff = ex.difficulty ? ` *(${ex.difficulty})*` : '';
            lines.push(`### ${ex.id} — ${exTitle}${diff}`, '');
            lines.push(`{{exercise: ${ex.id}}}`, '');
            lines.push('<!-- Write the exercise here -->', '');
        }
    }
    else {
        lines.push('*No exercises declared yet.*', '');
    }
    // Summary
    lines.push('## Summary', '', '<!-- Chapter summary -->', '');
    return lines.join('\n').trimEnd() + '\n';
}
/** Seed a revision-guide topic: Exam objectives / Core idea / Common
 *  misconceptions / Quick check / Exam-style questions / Summary. */
function seedRevisionGuideChapterContent(nfCh, acCh, claims, figures) {
    const num = nfCh.number ?? acCh.number;
    const title = nfCh.title ?? acCh.title ?? `Topic ${num}`;
    const lines = [exports.MANUSCRIPT_SEED_MARKER, '', `# Topic ${num} — ${title}`, ''];
    if (acCh.wordTarget)
        lines.push(`> *Target: ~${acCh.wordTarget.toLocaleString()} words*`, '');
    // Exam objectives
    lines.push('## Exam objectives', '');
    if (acCh.outcomes.length) {
        for (const code of acCh.outcomes)
            lines.push(`- ${code}`);
        lines.push('');
    }
    else {
        lines.push('*No exam objectives declared yet.*', '');
    }
    // Core idea (with claim + figure markers)
    lines.push('## Core idea', '');
    const chapterClaims = claims.filter(c => c.chapterNumber === num);
    const chapterFigures = figures.filter(f => f.chapterNumber === num);
    for (const c of chapterClaims)
        lines.push(`{{claim: ${c.id}}}`, '');
    for (const f of chapterFigures)
        lines.push(`{{figure: ${f.id}}}`, '');
    lines.push('<!-- Compressed explanation: what to recall, no scaffolding -->', '');
    // Key terms (revision-guide formats them as a glossary box)
    if (acCh.keyTerms.length) {
        lines.push('## Key terms', '');
        for (const term of acCh.keyTerms)
            lines.push(`- **${term}** —`);
        lines.push('');
    }
    // Common misconceptions
    lines.push('## Common misconceptions', '', '<!-- List exam traps and confusions -->', '');
    // Quick check
    lines.push('## Quick check', '');
    if (acCh.recallQuestions && acCh.recallQuestions > 0) {
        for (let i = 1; i <= acCh.recallQuestions; i++) {
            lines.push(`${i}. <!-- recall question -->`);
        }
        lines.push('');
    }
    else {
        lines.push('<!-- Short recall questions -->', '');
    }
    // Exam-style questions
    lines.push('## Exam-style questions', '');
    if (acCh.examPractice.length) {
        for (const ep of acCh.examPractice) {
            lines.push(`### ${ep.type} (${ep.count})`, '');
            for (let i = 1; i <= ep.count; i++) {
                lines.push(`${i}. <!-- ${ep.type} question -->`);
            }
            lines.push('');
        }
    }
    else {
        lines.push('<!-- Exam-style practice -->', '');
    }
    // Summary
    lines.push('## Summary', '', '<!-- One-paragraph wrap -->', '');
    return lines.join('\n').trimEnd() + '\n';
}
function seedAcademicChapterContent(nfCh, acCh, bookType, claims = [], figures = []) {
    return bookType === 'textbook'
        ? seedTextbookChapterContent(nfCh, acCh, claims, figures)
        : seedRevisionGuideChapterContent(nfCh, acCh, claims, figures);
}
/**
 * Seeds per-chapter manuscript files from a normalized WritingPlan.
 *
 * Write-if-missing semantics: a file is written only if it does not exist,
 * OR if it exists but still contains the seed marker (meaning the writer
 * has not yet touched it). Modified prose is never overwritten.
 *
 * Mode-aware: branches on plan.mode to seed fiction scenes or NF sections.
 * Academic-aware: when plan.academic is populated, uses textbook or
 * revision-guide templates instead of generic NF sections.
 */
function seedManuscriptFromPlan(plan, projectDir) {
    const manuscriptDir = path.join(projectDir, 'manuscript');
    fs.mkdirSync(manuscriptDir, { recursive: true });
    if (plan.mode === 'nonfiction') {
        if (plan.nfChapters.length === 0)
            return;
        const academic = plan.academic;
        const acByNumber = new Map();
        if (academic)
            for (const c of academic.chapters)
                acByNumber.set(c.number, c);
        for (const ch of plan.nfChapters) {
            const filePath = path.join(projectDir, nfChapterManuscriptPath(ch));
            const acCh = academic ? acByNumber.get(ch.number) : undefined;
            const content = (academic && acCh)
                ? seedAcademicChapterContent(ch, acCh, academic.bookType, plan.claims, plan.figures)
                : seedNfChapterContent(ch, plan.claims, plan.figures);
            writeIfMissing(filePath, content);
        }
        return;
    }
    if (plan.fictionChapters.length === 0)
        return;
    for (const ch of plan.fictionChapters) {
        const relPath = chapterManuscriptPath(ch);
        const filePath = path.join(projectDir, relPath);
        const content = seedChapterContent(ch);
        writeIfMissing(filePath, content);
    }
}
function writeIfMissing(filePath, content) {
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        return;
    }
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (isSeedFile(existing)) {
        fs.writeFileSync(filePath, content, 'utf-8');
    }
}
//# sourceMappingURL=manuscript-seeder.js.map