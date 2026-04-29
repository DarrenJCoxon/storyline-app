"use strict";
// Stage guides for the Academic pipeline (NF-14).
// Covers: ac-syllabus (NF-14.3), ac-chapters (NF-14.4), ac-critique, ac-master.
// Pattern mirrors stage-guides-nf-pipeline-a.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACADEMIC_GUIDE_ORDER = exports.ACADEMIC_GUIDES = void 0;
exports.getAcademicGuide = getAcademicGuide;
exports.ACADEMIC_GUIDES = {
    'ac-syllabus': {
        id: 'ac-syllabus',
        name: 'Outcome Inventory',
        phase: 'academic',
        index: 14,
        persona: 'curriculum-editor',
        contextDir: 'syllabi',
        opening: `Before we plan a single chapter, we need the authoritative list of learning outcomes — every objective the book must deliver on.

**How this stage works:**

Rather than typing outcomes into the chat, put your syllabus summaries into the \`syllabi/\` folder at the root of your project. Storyline reads those files and uses them to populate the outcome inventory.

**What to put in \`syllabi/\`:**
- Plain text or Markdown summaries of the relevant specification sections — *not* raw PDF exports
- One file per paper, module, or topic cluster works well
- Use the format your exam board uses for outcome codes (e.g. P4.1, LO-3.2.1, or just numbered)
- Include the outcome text verbatim if possible — accuracy matters here

**Why summaries, not the full spec:**
Full specification PDFs are dense and hard to parse reliably. A 1–2 page summary of "what students must be able to do in this module" gives me exactly what I need without the noise.

Once you've added your files, tell me and I'll read them and draft the outcome list. If you haven't added files yet, we can build the list manually by talking through the spec.`,
        questions: [
            {
                key: 'outcomes',
                label: 'Learning outcomes for this book',
                hint: 'Each outcome needs: code (e.g. P4.1 or LO-3), text (what the student must do), and optionally a Bloom\'s level (remember / understand / apply / analyse / evaluate / create)',
                type: 'array',
                itemSchema: {
                    code: 'Outcome code (e.g. P4.1, LO-3.2, or sequential number)',
                    text: 'What the student must be able to do — verbatim from the spec where possible',
                    bloom: '(Optional) Bloom\'s level: remember / understand / apply / analyse / evaluate / create',
                    module: '(Optional) Which paper, module, or topic cluster this belongs to',
                },
                required: true,
            },
            {
                key: 'syllabusSource',
                label: 'Which files in syllabi/ did you use?',
                hint: 'List the filenames — e.g. "gcse-physics-p4.md, gcse-physics-p5.md". This is the audit trail.',
                required: false,
            },
            {
                key: 'totalOutcomeCount',
                label: 'Total number of outcomes captured',
                hint: 'Used for the coverage report header',
                required: false,
            },
            {
                key: 'highBloomOutcomes',
                label: 'Which outcomes are at Evaluate or Create level (highest cognitive demand)?',
                hint: 'These need extended worked examples and multi-part exercises — flag them now so the chapter plan can weight them correctly',
                required: false,
            },
            {
                key: 'syllabusGaps',
                label: 'Any areas of the spec you\'re intentionally NOT covering?',
                hint: 'e.g. "Excluding Option topics", "Paper 3 practicals out of scope for this volume". Explicit exclusions protect the coverage report from false gaps.',
                required: false,
            },
        ],
        validation: ['outcomes'],
        summary: [
            { label: 'Outcomes captured', key: 'totalOutcomeCount' },
            { label: 'Source files', key: 'syllabusSource' },
            { label: 'High-Bloom outcomes', key: 'highBloomOutcomes' },
            { label: 'Intentional exclusions', key: 'syllabusGaps' },
        ],
        transition: 'Outcome inventory complete. Now let\'s plan the chapters and assign each outcome to the chapter that covers it.',
    },
    'ac-chapters': {
        id: 'ac-chapters',
        name: 'Chapter Plan',
        phase: 'academic',
        index: 15,
        persona: 'curriculum-editor',
        opening: `Now we map the outcome inventory onto chapters. Every declared outcome must be assigned to at least one chapter. The coverage report will flag anything that falls through the cracks.

Each chapter needs: its outcomes, key terms, prerequisite chapters, and the section structure. We'll also note any worked examples and exercises so the exercise index can track them from day one.`,
        questions: [
            {
                key: 'chapters',
                label: 'Chapters',
                hint: 'One entry per chapter. Assign outcomes by their codes from the outcome inventory.',
                type: 'array',
                itemSchema: {
                    number: 'Chapter number',
                    title: 'Chapter title',
                    outcomes: 'Array of outcome codes covered in this chapter (e.g. ["P4.1", "P4.2"])',
                    keyTerms: 'Array of key terms introduced or defined in this chapter',
                    prerequisites: 'Array of chapter numbers that must be read first (e.g. [1, 3])',
                    sections: 'Array of section objects: { title, type } where type is concept / worked-example / exercise / summary / exam-objectives / misconceptions / quick-check / exam-questions',
                    workedExamples: 'Array of worked example objects: { id (e.g. we-2.1), title, difficulty (foundation/higher/extension) }',
                    exercises: 'Array of exercise objects: { id (e.g. ex-2.1), title, difficulty }',
                    wordTarget: 'Approximate word count for this chapter',
                    figures: '(Optional) Array of figures: { type, purpose }',
                },
                required: true,
            },
            {
                key: 'chapterCount',
                label: 'Total number of chapters',
                required: false,
            },
        ],
        validation: ['chapters'],
        summary: [
            { label: 'Chapter count', key: 'chapterCount' },
        ],
        transition: 'Chapter plan complete. Running coverage check now.',
    },
    'ac-critique': {
        id: 'ac-critique',
        name: 'Consistency & Critique',
        phase: 'academic',
        index: 16,
        persona: 'academic-editor',
        opening: `Let's audit the plan before any prose is written. We're checking outcome coverage, prerequisite chain integrity, term consistency, and exercise distribution.`,
        questions: [
            {
                key: 'coverageAudit',
                label: 'Are all outcomes from the inventory covered by at least one chapter?',
                hint: 'Review the outcome-coverage report. List any uncovered outcomes.',
                required: false,
            },
            {
                key: 'prerequisiteIssues',
                label: 'Any forward-reference issues in the prerequisite chain?',
                hint: 'A chapter relying on content introduced in a later chapter. List and resolve.',
                required: false,
            },
            {
                key: 'exerciseDistribution',
                label: 'Is exercise difficulty balanced across the book?',
                hint: 'Too many foundation-only chapters? Any chapter with no exercises at all?',
                required: false,
            },
            {
                key: 'termConsistency',
                label: 'Any key terms defined in multiple chapters with different definitions?',
                hint: 'The glossary will flag these. Resolve before drafting.',
                required: false,
            },
        ],
        validation: [],
        summary: [
            { label: 'Coverage gaps', key: 'coverageAudit' },
            { label: 'Prerequisite issues', key: 'prerequisiteIssues' },
        ],
        transition: 'Critique complete. Generating the academic master document.',
    },
    'ac-master': {
        id: 'ac-master',
        name: 'Master Document',
        phase: 'academic',
        index: 17,
        persona: 'academic-editor',
        opening: `Generating the academic master document — outcome map, chapter plan, glossary preview, exercise index, figure registry, and claim risk overview.`,
        questions: [],
        validation: [],
        summary: [],
        transition: 'Academic planning complete. Proceed to manuscript drafting.',
    },
};
function getAcademicGuide(stageId) {
    return exports.ACADEMIC_GUIDES[stageId] ?? null;
}
exports.ACADEMIC_GUIDE_ORDER = Object.values(exports.ACADEMIC_GUIDES)
    .sort((a, b) => a.index - b.index);
//# sourceMappingURL=stage-guides-nf-academic.js.map