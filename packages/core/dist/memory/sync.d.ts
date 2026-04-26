export declare function getPendingEntries(cwd?: string): Promise<any[]>;
export declare function markSynced(ids: any, cwd?: string): Promise<{
    marked: number;
    totalSynced?: undefined;
} | {
    marked: any;
    totalSynced: number;
}>;
export declare function getSyncStatus(cwd?: string): Promise<{
    totalEntries: number;
    syncedEntries: number;
    pendingEntries: number;
    logPath: string;
    syncedPath: string;
}>;
//# sourceMappingURL=sync.d.ts.map