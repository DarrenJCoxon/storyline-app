export interface AcademicGuide {
    id: string;
    name: string;
    phase: string;
    index: number;
    persona: string;
    opening: string;
    /** When set, the system prompt layer reads all files in this project-relative
     *  folder and injects their contents as context before the stage runs. */
    contextDir?: string;
    questions?: any[];
    validation?: string[];
    summary?: any[];
    transition?: string;
    [extra: string]: unknown;
}
export declare const ACADEMIC_GUIDES: Record<string, AcademicGuide>;
export declare function getAcademicGuide(stageId: string): AcademicGuide | null;
export declare const ACADEMIC_GUIDE_ORDER: AcademicGuide[];
//# sourceMappingURL=stage-guides-nf-academic.d.ts.map