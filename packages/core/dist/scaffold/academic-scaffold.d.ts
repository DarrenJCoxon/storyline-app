/**
 * Creates syllabi/ at projectDir with a README if the folder doesn't exist yet.
 * Safe to call multiple times — no-op if already seeded.
 */
export declare function seedSyllabiFolder(projectDir: string): void;
/**
 * Read all .md and .txt files from syllabi/ (excluding README.md).
 * Returns an array of { filename, content } objects.
 * Returns [] if the folder doesn't exist or is empty.
 */
export declare function readSyllabiFiles(projectDir: string): Array<{
    filename: string;
    content: string;
}>;
//# sourceMappingURL=academic-scaffold.d.ts.map