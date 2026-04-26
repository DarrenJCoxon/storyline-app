export declare function analyzeGaps(projectDir: any, state: any): Promise<{
    generatedAt: string;
    stats: {
        total: number;
        verified: number;
        pending: number;
        disputed: number;
        needsFollowUp: number;
        primaryOrPeerReviewed: number;
    };
    thinChapters: {
        chapterNumber: any;
        chapterTitle: any;
        linkedCount: number;
    }[];
    unsourcedItems: {
        id: any;
        title: any;
        subtype: any;
    }[];
    lowReliabilityOnly: {
        chapterNumber: any;
        chapterTitle: any;
        itemCount: number;
    }[];
    unverified: {
        id: any;
        title: any;
        verification: any;
        subtype: any;
    }[];
    tagCoverage: {};
}>;
export declare function formatGapsReport(findings: any): string;
//# sourceMappingURL=critique.d.ts.map