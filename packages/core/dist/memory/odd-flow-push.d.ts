export declare function pushEntriesToOddFlow(entries: any, { cwd }?: {
    cwd?: string | undefined;
}): Promise<{
    pushed: number;
    failed: number;
    errors: never[];
    cli: null;
    skipped: boolean;
} | {
    sqlJsMissing?: boolean | undefined;
    pushed: number;
    failed: number;
    errors: any[];
    cli: string;
    skipped: boolean;
}>;
//# sourceMappingURL=odd-flow-push.d.ts.map