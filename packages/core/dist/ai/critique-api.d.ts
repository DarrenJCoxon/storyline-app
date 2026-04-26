export declare function runFullCritique(state: any, researchGaps?: null): {
    findings: any[];
    summary: {
        total: number;
        errors: number;
        warnings: number;
        tips: number;
    };
    blocking: boolean;
};
export declare function buildSummaryMarkdown(critiqueResult: any): string;
export declare function generateCritiqueReport(state: any, projectDir?: string, researchGaps?: null): Promise<{
    findings: any[];
    summary: {
        total: number;
        errors: number;
        warnings: number;
        tips: number;
    };
    blocking: boolean;
    reportPath: string;
    summaryMarkdown: string;
}>;
//# sourceMappingURL=critique-api.d.ts.map