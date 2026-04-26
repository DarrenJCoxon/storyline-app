export declare const PIPELINE_A_STAGES: ({
    index: number;
    id: string;
    name: string;
    subModes: null;
} | {
    index: number;
    id: string;
    name: string;
    subModes: string[];
})[];
export declare const PIPELINE_A_BY_ID: {
    [k: string]: {
        index: number;
        id: string;
        name: string;
        subModes: null;
    } | {
        index: number;
        id: string;
        name: string;
        subModes: string[];
    };
};
export declare function getActiveStages(subMode: any): ({
    index: number;
    id: string;
    name: string;
    subModes: null;
} | {
    index: number;
    id: string;
    name: string;
    subModes: string[];
})[];
export declare function runStage(stageId: any, state: any): Promise<{
    error: string;
    status?: undefined;
    stage?: undefined;
    reason?: undefined;
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
        subModes: string[];
    };
    reason: string;
    error?: undefined;
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
    } | {
        index: number;
        id: string;
        name: string;
        subModes: string[];
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
    reason?: undefined;
}>;
export declare function extractFrameworkFromStage(nfStages: any): {
    title: any;
    subtitle: any;
    modelName: any;
    principles: any;
    author: any;
    coverAccent: any;
} | null;
//# sourceMappingURL=index.d.ts.map