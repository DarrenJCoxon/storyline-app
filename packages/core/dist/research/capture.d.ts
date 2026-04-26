export declare function addItem(projectDir: any, { title, content, subtype, reliability, verification, tags, sources, links, }?: {
    content?: string | undefined;
    subtype?: string | undefined;
    reliability?: string | undefined;
    verification?: string | undefined;
    tags?: never[] | undefined;
    sources?: never[] | undefined;
    links?: never[] | undefined;
}): Promise<{
    content: string;
    id: string;
    schemaVersion: number;
    type: string;
    subtype: string;
    reliability: string;
    verification: string;
    tags: never[];
    links: never[];
    sources: never[];
    title: any;
    createdAt: string;
    updatedAt: string;
}>;
export declare function getItem(projectDir: any, id: any): Promise<{
    content: any;
} | null>;
export declare function editItem(projectDir: any, id: any, updates: any): Promise<any>;
export declare function removeItem(projectDir: any, id: any): Promise<boolean>;
export declare function listItems(projectDir: any, { subtype, reliability, verification, tags, }?: {}): Promise<({
    content: any;
} | null)[]>;
//# sourceMappingURL=capture.d.ts.map