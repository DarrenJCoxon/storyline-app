import type { WritingPlan, FictionChapter, NfChapter, ClaimEvidenceItem, FigurePlanItem, AcademicChapter } from '../state/writing-plan.js';
export declare const MANUSCRIPT_SEED_MARKER = "<!-- storyline:seed:v1 -->";
export declare function seedChapterContent(ch: FictionChapter): string;
export declare function chapterManuscriptPath(ch: FictionChapter): string;
export declare function nfChapterManuscriptPath(ch: NfChapter): string;
export declare function seedNfChapterContent(ch: NfChapter, claims?: ClaimEvidenceItem[], figures?: FigurePlanItem[]): string;
export declare function seedAcademicChapterContent(nfCh: NfChapter, acCh: AcademicChapter, bookType: 'textbook' | 'revision-guide', claims?: ClaimEvidenceItem[], figures?: FigurePlanItem[]): string;
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
export declare function seedManuscriptFromPlan(plan: WritingPlan, projectDir: string): void;
//# sourceMappingURL=manuscript-seeder.d.ts.map