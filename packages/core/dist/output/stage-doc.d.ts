import type { ProjectState } from '../state/project-state.js';
/**
 * Write a per-stage markdown document to
 * `<projectPath>/output/stages/<stageId>.md`.
 *
 * Returns the absolute path written, or null if no renderer exists for
 * the given stageId.
 */
export declare function writeStageDoc(stageId: string, state: ProjectState, projectPath: string): Promise<string | null>;
//# sourceMappingURL=stage-doc.d.ts.map