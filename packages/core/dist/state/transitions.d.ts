import { type ProjectState, type StageEntry } from './project-state.js';
export declare function deriveCurrentStage(state: ProjectState): StageEntry | null;
/**
 * Authoritative completion check for any fiction stage. Returns true iff
 * every declarative requirement for the stage is satisfied. Stages with
 * no declared requirement (e.g. critique, masterDoc) fall back to the
 * `stages[id].completed` flag.
 *
 * Use this as the gate before marking a stage complete and advancing —
 * it's the same logic that `deriveCurrentStage` uses to decide what's next.
 */
export declare function isStageComplete(stageId: string, state: ProjectState): boolean;
/** Whether a stage has any declarative field requirement (vs only a completed flag). */
export declare function hasTransitionRequirement(stageId: string): boolean;
export declare function calculateProgress(state: ProjectState): number;
export interface GateResult {
    passed: boolean;
    message?: string;
    missing?: string[];
    stageId?: string;
}
export declare function checkStageGate(stageId: string, state: ProjectState): GateResult | null;
export declare function getMissingRequirements(stageId: string, state: ProjectState): string[];
export declare function getDownstreamImpacts(stageId: string): string[];
//# sourceMappingURL=transitions.d.ts.map