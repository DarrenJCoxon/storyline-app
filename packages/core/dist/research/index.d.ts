export declare function rebuildIndex(projectDir: any): Promise<{
    schemaVersion: number;
    lastRebuilt: string;
    projectDir: any;
    items: {
        id: any;
        title: any;
        subtype: any;
        reliability: any;
        verification: any;
        tags: any;
        links: any;
        sources: any;
        createdAt: any;
        updatedAt: any;
        contentPreview: any;
    }[];
    stats: {
        total: number;
        byVerification: {
            verified: number;
            pending: number;
            disputed: number;
            'needs-follow-up': number;
        };
        byReliability: {
            primary: number;
            'peer-reviewed': number;
            secondary: number;
            anecdotal: number;
        };
        bySubtype: {};
    };
}>;
export declare function loadIndex(projectDir: any): Promise<any>;
export declare function buildResearchMemoryEntries(items: any, state: any): {
    namespace: string;
    key: string;
    value: any;
    tags: any[];
}[];
export declare function syncResearchToMemory(projectDir: any, state: any): Promise<{
    logPath: null;
    entriesWithIds: never[];
} | {
    logPath: string;
    entriesWithIds: any;
}>;
//# sourceMappingURL=index.d.ts.map