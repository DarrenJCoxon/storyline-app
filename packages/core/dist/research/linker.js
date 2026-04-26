"use strict";
// @ts-nocheck
// Research linker — bidirectional links between research items and planning targets.
// Targets: chapter:<n>, scene:<ch>-<s>, stage:<stageId>, claim:<id>
// Links are stored in the item's frontmatter links[] field.
// The reverse index (target → items) is derived by scanning all items.
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLink = addLink;
exports.removeLink = removeLink;
exports.getLinksForItem = getLinksForItem;
exports.getItemsForTarget = getItemsForTarget;
exports.getItemsForChapter = getItemsForChapter;
exports.validateLinks = validateLinks;
exports.buildLinkSummary = buildLinkSummary;
const capture_js_1 = require("./capture.js");
const schema_js_1 = require("./schema.js");
function parseLinkTarget(target) {
    const [type, ...rest] = target.split(':');
    if (!schema_js_1.LINK_TYPES.includes(type))
        throw new Error(`Unknown link type: ${type}. Valid: ${schema_js_1.LINK_TYPES.join(', ')}`);
    return { type, identifier: rest.join(':') };
}
// ── Public API ────────────────────────────────────────────────────────
async function addLink(projectDir, itemId, target) {
    parseLinkTarget(target); // validates
    const item = await (0, capture_js_1.getItem)(projectDir, itemId);
    if (!item)
        throw new Error(`Research item not found: ${itemId}`);
    const links = item.links || [];
    if (links.includes(target))
        return item; // idempotent
    return (0, capture_js_1.editItem)(projectDir, itemId, { links: [...links, target] });
}
async function removeLink(projectDir, itemId, target) {
    const item = await (0, capture_js_1.getItem)(projectDir, itemId);
    if (!item)
        throw new Error(`Research item not found: ${itemId}`);
    const links = (item.links || []).filter(l => l !== target);
    return (0, capture_js_1.editItem)(projectDir, itemId, { links });
}
async function getLinksForItem(projectDir, itemId) {
    const item = await (0, capture_js_1.getItem)(projectDir, itemId);
    if (!item)
        return [];
    return item.links || [];
}
async function getItemsForTarget(projectDir, target) {
    parseLinkTarget(target); // validates
    const items = await (0, capture_js_1.listItems)(projectDir);
    return items.filter(item => (item.links || []).includes(target));
}
async function getItemsForChapter(projectDir, chapterNumber) {
    const target = `chapter:${chapterNumber}`;
    return getItemsForTarget(projectDir, target);
}
async function validateLinks(projectDir, state) {
    const items = await (0, capture_js_1.listItems)(projectDir);
    const findings = [];
    const validChapters = new Set((state?.chapterOutline || []).map(c => `chapter:${c.chapterNumber}`));
    for (const item of items) {
        for (const link of (item.links || [])) {
            const { type } = parseLinkTarget(link);
            if (type === 'chapter' && validChapters.size > 0 && !validChapters.has(link)) {
                findings.push({
                    itemId: item.id,
                    itemTitle: item.title,
                    link,
                    issue: 'chapter-not-in-outline',
                });
            }
        }
    }
    return findings;
}
// Summary: { target → count } map for all links across all items
async function buildLinkSummary(projectDir) {
    const items = await (0, capture_js_1.listItems)(projectDir);
    const summary = {};
    for (const item of items) {
        for (const link of (item.links || [])) {
            summary[link] = (summary[link] || 0) + 1;
        }
    }
    return summary;
}
//# sourceMappingURL=linker.js.map