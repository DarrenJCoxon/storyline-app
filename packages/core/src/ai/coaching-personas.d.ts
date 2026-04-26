import type { ProjectState } from '../state/project-state.js';
export interface QualityCheck {
    check: string;
    explanation: string;
    passed?: boolean;
}
export interface Persona {
    name: string;
    stage: string;
    tagline: string;
    activation: string;
    probingQuestions: Record<string, string[]>;
    qualityChecklist: QualityCheck[];
    transitionGate: string;
}
export declare const PERSONAS: Record<string, Persona>;
export declare function getPersonaForStage(stageId: string): Persona | null;
export declare function runQualityChecklist(stageId: string, state: ProjectState): QualityCheck[];
export declare function formatPersonaIntro(stageId: string): string;
//# sourceMappingURL=coaching-personas.d.ts.map