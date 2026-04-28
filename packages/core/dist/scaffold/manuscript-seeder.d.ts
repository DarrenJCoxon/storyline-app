import type { WritingPlan, FictionChapter, NfChapter } from '../state/writing-plan.js';
export declare const MANUSCRIPT_SEED_MARKER = "<!-- storyline:seed:v1 -->";
export declare function seedChapterContent(ch: FictionChapter): string;
export declare function chapterManuscriptPath(ch: FictionChapter): string;
export declare function nfChapterManuscriptPath(ch: NfChapter): string;
export declare function seedNfChapterContent(ch: NfChapter): string;
/**
 * Seeds per-chapter manuscript files from a normalized WritingPlan.
 *
 * Write-if-missing semantics: a file is written only if it does not exist,
 * OR if it exists but still contains the seed marker (meaning the writer
 * has not yet touched it). Modified prose is never overwritten.
 *
 * Mode-aware: branches on plan.mode to seed fiction scenes or NF sections.
 */
export declare function seedManuscriptFromPlan(plan: WritingPlan, projectDir: string): void;
//# sourceMappingURL=manuscript-seeder.d.ts.map