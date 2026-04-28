import type { WritingPlan, FictionChapter } from '../state/writing-plan.js';
export declare const MANUSCRIPT_SEED_MARKER = "<!-- storyline:seed:v1 -->";
export declare function seedChapterContent(ch: FictionChapter): string;
export declare function chapterManuscriptPath(ch: FictionChapter): string;
/**
 * Seeds per-chapter manuscript files from a normalized WritingPlan.
 *
 * Write-if-missing semantics: a file is written only if it does not exist,
 * OR if it exists but still contains the seed marker (meaning the writer
 * has not yet touched it). Modified prose is never overwritten.
 *
 * Mode-aware: only runs for fiction projects (plan.mode === 'fiction').
 * NF seeding (NF-11.6) will use the same function with nfChapters.
 */
export declare function seedManuscriptFromPlan(plan: WritingPlan, projectDir: string): void;
//# sourceMappingURL=manuscript-seeder.d.ts.map