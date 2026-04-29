export declare const BOOK_DNA_STAGES: {
    index: number;
    id: string;
    name: string;
}[];
export declare const BOOK_DNA_BY_ID: {
    [k: string]: {
        index: number;
        id: string;
        name: string;
    };
};
export declare function runStage(stageId: any, state: any): Promise<{
    error: string;
    status?: undefined;
    stage?: undefined;
    guide?: undefined;
    currentData?: undefined;
    critique?: undefined;
    inferredPipeline?: undefined;
    stateSnapshot?: undefined;
} | {
    status: string;
    stage: {
        index: number;
        id: string;
        name: string;
    };
    guide: import("../../ai/stage-guides-nf-dna.js").NfDnaGuide | null;
    currentData: any;
    critique: {
        stageId: any;
        issueCount: any;
        blocking: any;
        issues: any;
        formatted: any;
    } | null;
    inferredPipeline: "A" | "B" | "C" | "academic" | null;
    stateSnapshot: {
        mode: any;
        pipeline: any;
        subMode: any;
    } | null;
    error?: undefined;
}>;
export declare function derivePipelineFromCategoryData(categoryData: any): "A" | "B" | "C" | "academic" | null;
//# sourceMappingURL=index.d.ts.map