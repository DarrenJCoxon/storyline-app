export declare const PIPELINE_B_STAGES: {
    index: number;
    id: string;
    name: string;
    subModes: null;
}[];
export declare const PIPELINE_B_BY_ID: {
    [k: string]: {
        index: number;
        id: string;
        name: string;
        subModes: null;
    };
};
export declare function runStage(stageId: any, state: any): Promise<{
    error: string;
    status?: undefined;
    stage?: undefined;
    guide?: undefined;
    currentData?: undefined;
    critique?: undefined;
    stateSnapshot?: undefined;
} | {
    status: string;
    stage: {
        index: number;
        id: string;
        name: string;
        subModes: null;
    };
    guide: import("../../index.js").NfDnaGuide | null;
    currentData: any;
    critique: {
        stageId: any;
        issueCount: any;
        blocking: any;
        issues: any;
        formatted: any;
    } | null;
    stateSnapshot: {
        mode: any;
        pipeline: any;
        subMode: any;
    } | null;
    error?: undefined;
}>;
//# sourceMappingURL=index.d.ts.map