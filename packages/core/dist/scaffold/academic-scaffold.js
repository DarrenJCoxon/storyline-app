"use strict";
// NF-14.3 — Academic project scaffold helpers.
// Creates the syllabi/ folder the writer drops syllabus summaries into.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSyllabiFolder = seedSyllabiFolder;
exports.readSyllabiFiles = readSyllabiFiles;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SYLLABI_README = `# Syllabus Documents

Put your syllabus summaries here before starting the Outcome Inventory stage.

## What to add

Storyline reads these files when you enter the Outcome Inventory stage and uses
their content to populate the learning outcome list. It works best with:

- **Plain text or Markdown** (.md or .txt) — not PDF exports
- **Summaries, not full specifications** — a 1–2 page outline of what students must
  know and be able to do per module is ideal. Full spec PDFs are dense and hard
  to parse reliably.
- **One file per paper, module, or topic cluster** — e.g.:
  - \`paper-1-cell-biology.md\`
  - \`paper-2-organisation.md\`

## Suggested format for each file

\`\`\`
# Paper 1 — Cell Biology (AQA GCSE Biology 8461)

## Learning outcomes

B1.1 Describe the structure of prokaryotic and eukaryotic cells
B1.2 Explain how the specialised structures of cells relate to their function
B1.3 Evaluate the evidence for the endosymbiotic theory
\`\`\`

Use the exact codes from your exam board specification where available (e.g. B1.1, P4.2a).
These codes become the outcome IDs the coverage report checks against.

## What Storyline does with these files

When you enter the Outcome Inventory stage, Storyline reads every file in this
folder and offers to draft the outcome list from their contents. You can review,
edit, and add outcomes before saving.

The outcome list becomes the authoritative inventory. The coverage report checks
every chapter plan against it and flags any outcome with zero chapter coverage.
`;
/**
 * Creates syllabi/ at projectDir with a README if the folder doesn't exist yet.
 * Safe to call multiple times — no-op if already seeded.
 */
function seedSyllabiFolder(projectDir) {
    const syllabiDir = path.join(projectDir, 'syllabi');
    if (!fs.existsSync(syllabiDir)) {
        fs.mkdirSync(syllabiDir, { recursive: true });
    }
    const readmePath = path.join(syllabiDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, SYLLABI_README, 'utf-8');
    }
}
/**
 * Read all .md and .txt files from syllabi/ (excluding README.md).
 * Returns an array of { filename, content } objects.
 * Returns [] if the folder doesn't exist or is empty.
 */
function readSyllabiFiles(projectDir) {
    const syllabiDir = path.join(projectDir, 'syllabi');
    if (!fs.existsSync(syllabiDir))
        return [];
    const files = fs.readdirSync(syllabiDir)
        .filter(f => (f.endsWith('.md') || f.endsWith('.txt')) && f.toLowerCase() !== 'readme.md')
        .sort();
    return files.flatMap(filename => {
        try {
            const content = fs.readFileSync(path.join(syllabiDir, filename), 'utf-8').trim();
            if (!content)
                return [];
            return [{ filename, content }];
        }
        catch {
            return [];
        }
    });
}
//# sourceMappingURL=academic-scaffold.js.map