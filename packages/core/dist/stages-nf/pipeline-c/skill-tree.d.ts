export declare function validateSkillTree(nodes: any, edges: any): {
    valid: boolean;
    errors: string[];
    warnings: any[];
    cycles: never[];
    orphans: never[];
    topologicalOrder: never[];
    roots?: undefined;
} | {
    valid: boolean;
    errors: string[];
    warnings: string[];
    cycles: any[];
    orphans: any;
    topologicalOrder: any[];
    roots: any;
};
export declare function saveSkillTree(projectDir: any, decompose: any, prereqs: any, targetSkill: any): Promise<{
    jsonPath: string;
    mdPath: string;
    nodeCount: any;
    edgeCount: number;
    valid: boolean;
    errors: string[];
    warnings: any[] | string[];
    topologicalOrder: any[] | never[];
}>;
export declare function loadSkillTree(projectDir: any): Promise<any>;
//# sourceMappingURL=skill-tree.d.ts.map