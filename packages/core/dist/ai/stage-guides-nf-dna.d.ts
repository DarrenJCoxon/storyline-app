export interface NfDnaGuide {
    id: string;
    name: string;
    phase: string;
    index: number;
    persona: string;
    opening: string;
    questions?: any[];
    pipelineRouting?: any;
    validation?: string[];
    summary?: any[];
    transition?: string;
    [extra: string]: unknown;
}
export declare const CATEGORY_PIPELINE_MAP: Record<string, 'A' | 'B' | 'C'>;
export declare function inferPipelineFromCategory(category?: string | null): 'A' | 'B' | 'C' | null;
export declare const NF_DNA_GUIDES: Record<string, NfDnaGuide>;
export declare function getNfDnaGuide(stageId: string): NfDnaGuide | null;
export declare const NF_DNA_GUIDE_ORDER: NfDnaGuide[];
//# sourceMappingURL=stage-guides-nf-dna.d.ts.map