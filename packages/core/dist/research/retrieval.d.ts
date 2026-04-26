import { getItemsForChapter } from './linker.js';
export declare function getItemsByTags(projectDir: any, tags: any): Promise<({
    content: any;
} | null)[]>;
export declare function getItemsByVerification(projectDir: any, verificationState: any): Promise<({
    content: any;
} | null)[]>;
export declare function getItemsBySubtype(projectDir: any, subtype: any): Promise<({
    content: any;
} | null)[]>;
export declare function getItemsByReliability(projectDir: any, reliability: any): Promise<({
    content: any;
} | null)[]>;
export declare function searchItems(projectDir: any, query: any): Promise<({
    content: any;
} | null)[]>;
export { getItemsForChapter };
export declare function buildRetrievalPayload(projectDir: any, { chapterNumber, query, tags }?: {}): Promise<{
    context: {
        chapterNumber: any;
        query: any;
        tags: any;
    };
    count: number;
    items: {
        id: any;
        title: any;
        subtype: any;
        reliability: any;
        verification: any;
        tags: any;
        links: any;
        sources: any;
        excerpt: any;
    }[];
}>;
//# sourceMappingURL=retrieval.d.ts.map