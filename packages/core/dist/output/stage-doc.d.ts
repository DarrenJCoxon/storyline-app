import { type ProjectState } from '../state/project-state.js';
/**
 * Write a per-stage markdown document to
 * `<projectPath>/planning/stages/<stageId>.md`.
 *
 * Returns the absolute path written, or null if there is no captured
 * data for the stage (no specific renderer applied AND state[stageId]
 * is empty). A null return is the "nothing to write yet" signal —
 * callers can treat it the same as a successful no-op.
 */
export declare function writeStageDoc(stageId: string, state: ProjectState, projectPath: string): Promise<string | null>;
//# sourceMappingURL=stage-doc.d.ts.map