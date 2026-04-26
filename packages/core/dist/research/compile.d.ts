export declare function formatChicago(item: any): string;
export declare function formatAPA(item: any): string;
export declare function formatMLA(item: any): string;
export declare function generateBibliography(projectDir: any, { citationStyle }?: {
    citationStyle?: string | undefined;
}): Promise<{
    bibPath: string;
    entryCount: number;
    citationStyle: string;
    entries: string[];
}>;
export declare function generateEndnotesForChapter(projectDir: any, chapterNumber: any, { citationStyle }?: {
    citationStyle?: string | undefined;
}): Promise<{
    chapterNumber: any;
    notes: {
        number: number;
        itemId: any;
        title: any;
        citation: string;
        notes: any;
    }[];
}>;
export declare function generateAllEndnotes(projectDir: any, chapterNumbers: any, { citationStyle }?: {
    citationStyle?: string | undefined;
}): Promise<{
    endnotePath: string;
    chapterCount: number;
} | null>;
export declare function generateFactCheckReport(projectDir: any): Promise<{
    reportPath: string;
    summary: {
        total: number;
        verified: number;
        pending: number;
        disputed: number;
        needsFollowUp: number;
        unverifiedCount: number;
    };
}>;
//# sourceMappingURL=compile.d.ts.map