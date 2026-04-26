export declare function addLink(projectDir: any, itemId: any, target: any): Promise<any>;
export declare function removeLink(projectDir: any, itemId: any, target: any): Promise<any>;
export declare function getLinksForItem(projectDir: any, itemId: any): Promise<any>;
export declare function getItemsForTarget(projectDir: any, target: any): Promise<({
    content: any;
} | null)[]>;
export declare function getItemsForChapter(projectDir: any, chapterNumber: any): Promise<({
    content: any;
} | null)[]>;
export declare function validateLinks(projectDir: any, state: any): Promise<{
    itemId: any;
    itemTitle: any;
    link: any;
    issue: string;
}[]>;
export declare function buildLinkSummary(projectDir: any): Promise<{}>;
//# sourceMappingURL=linker.d.ts.map