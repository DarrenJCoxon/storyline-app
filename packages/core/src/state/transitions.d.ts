import { type ProjectState, type StageEntry } from './project-state.js';
export declare function deriveCurrentStage(state: ProjectState): StageEntry | null;
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