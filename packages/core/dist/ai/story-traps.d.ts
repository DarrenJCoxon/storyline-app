import type { ProjectState } from '../state/project-state.js';
export type TrapSeverity = 'error' | 'warning';
export interface TrapResult {
    id: string;
    name: string;
    severity: TrapSeverity;
    description: string;
    stcReasoning: string;
    details: string[] | null;
    fixProtocol: string[];
}
export declare function runStoryTraps(state: ProjectState): TrapResult[];
//# sourceMappingURL=story-traps.d.ts.map