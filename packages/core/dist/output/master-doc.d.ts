import type { ProjectState } from '../state/project-state.js';
export interface MasterDocResult {
    path: string;
    wordCount: number;
    chapterCount: number;
    beatCount: number;
    threadCount: number;
}
export declare function generateMasterDocument(state: ProjectState, projectPath: string): Promise<MasterDocResult>;
//# sourceMappingURL=master-doc.d.ts.map