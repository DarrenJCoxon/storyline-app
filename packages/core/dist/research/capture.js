"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addItem = addItem;
exports.getItem = getItem;
exports.editItem = editItem;
exports.removeItem = removeItem;
exports.listItems = listItems;
// @ts-nocheck
const fs_extra_1 = __importDefault(require("fs-extra"));
const { ensureDir, pathExists, readFile, writeFile, remove, readdir } = fs_extra_1.default;
const path_1 = require("path");
const schema_js_1 = require("./schema.js");
const ITEMS_DIR = (projectDir) => (0, path_1.join)(projectDir, '.storyline', 'research', 'items');
function generateId() {
    return `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
// ── Frontmatter parser (no external YAML dep) ─────────────────────────
// Format: simple key: value, arrays as [a, b, c]
function parseFrontmatter(raw) {
    const meta = {};
    for (const line of raw.split('\n')) {
        if (!line.trim())
            continue;
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1)
            continue;
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        if (val.startsWith('[') && val.endsWith(']')) {
            const inner = val.slice(1, -1).trim();
            meta[key] = inner ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
        }
        else if (val === 'null' || val === '') {
            meta[key] = null;
        }
        else {
            meta[key] = val;
        }
    }
    return meta;
}
function formatFrontmatter(meta) {
    return Object.entries(meta).map(([k, v]) => {
        if (Array.isArray(v))
            return `${k}: [${v.join(', ')}]`;
        if (v === null || v === undefined)
            return `${k}: null`;
        return `${k}: ${v}`;
    }).join('\n');
}
function parseItemFile(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        throw new Error('Invalid item file format — missing frontmatter delimiters');
    const meta = parseFrontmatter(match[1]);
    const content = match[2].trim();
    return { ...meta, content };
}
function formatItemFile(meta, content) {
    const { content: _c, ...frontMeta } = meta;
    return `---\n${formatFrontmatter(frontMeta)}\n---\n\n${content || ''}\n`;
}
function itemPath(projectDir, id) {
    return (0, path_1.join)(ITEMS_DIR(projectDir), `${id}.md`);
}
// ── Public API ────────────────────────────────────────────────────────
async function addItem(projectDir, { title, content = '', subtype = 'note', reliability = 'secondary', verification = 'pending', tags = [], sources = [], links = [], } = {}) {
    if (!title)
        throw new Error('title is required');
    if (!schema_js_1.ITEM_SUBTYPES.includes(subtype))
        throw new Error(`Invalid subtype: ${subtype}`);
    if (!schema_js_1.RELIABILITY_TIERS.includes(reliability))
        throw new Error(`Invalid reliability: ${reliability}`);
    if (!schema_js_1.VERIFICATION_STATES.includes(verification))
        throw new Error(`Invalid verification: ${verification}`);
    await ensureDir(ITEMS_DIR(projectDir));
    const id = generateId();
    const now = new Date().toISOString();
    const meta = {
        id,
        schemaVersion: schema_js_1.SCHEMA_VERSION,
        type: 'research',
        subtype,
        reliability,
        verification,
        tags,
        links,
        sources,
        title,
        createdAt: now,
        updatedAt: now,
    };
    await writeFile(itemPath(projectDir, id), formatItemFile(meta, content), 'utf8');
    return { ...meta, content };
}
async function getItem(projectDir, id) {
    const path = itemPath(projectDir, id);
    if (!(await pathExists(path)))
        return null;
    const raw = await readFile(path, 'utf8');
    return parseItemFile(raw);
}
async function editItem(projectDir, id, updates) {
    const existing = await getItem(projectDir, id);
    if (!existing)
        throw new Error(`Research item not found: ${id}`);
    const { content: newContent, ...metaUpdates } = updates;
    const { content: existingContent, ...existingMeta } = existing;
    const merged = {
        ...existingMeta,
        ...metaUpdates,
        id, // id is immutable
        type: 'research', // type is immutable
        schemaVersion: schema_js_1.SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
    };
    const content = newContent !== undefined ? newContent : existingContent;
    await writeFile(itemPath(projectDir, id), formatItemFile(merged, content), 'utf8');
    return { ...merged, content };
}
async function removeItem(projectDir, id) {
    const path = itemPath(projectDir, id);
    if (!(await pathExists(path)))
        return false;
    await remove(path);
    return true;
}
async function listItems(projectDir, { subtype, reliability, verification, tags, } = {}) {
    const dir = ITEMS_DIR(projectDir);
    if (!(await pathExists(dir)))
        return [];
    const files = (await readdir(dir)).filter(f => f.endsWith('.md'));
    const items = await Promise.all(files.map(async (f) => {
        try {
            const raw = await readFile((0, path_1.join)(dir, f), 'utf8');
            return parseItemFile(raw);
        }
        catch {
            return null;
        }
    }));
    return items
        .filter(Boolean)
        .filter(item => !subtype || item.subtype === subtype)
        .filter(item => !reliability || item.reliability === reliability)
        .filter(item => !verification || item.verification === verification)
        .filter(item => !tags || tags.length === 0 || tags.some(t => (item.tags || []).includes(t)));
}
//# sourceMappingURL=capture.js.map