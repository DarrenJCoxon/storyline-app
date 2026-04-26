"use strict";
// @ts-nocheck
// Timeline artifact for Pipeline B (Narrative Non-Fiction)
// Saves .storyline/timeline.json and .storyline/timeline.md from pb-timeline stage data.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveTimeline = saveTimeline;
exports.loadTimeline = loadTimeline;
const fs_extra_1 = __importDefault(require("fs-extra"));
const { ensureDir, writeFile } = fs_extra_1.default;
const path_1 = require("path");
const STORYLINE_DIR = (projectDir) => (0, path_1.join)(projectDir, '.storyline');
function formatTimelineMarkdown(data) {
    const { timelineSpan, pivotMoment, timelineEvents = [] } = data;
    const lines = [
        `# Timeline`,
        ``,
        timelineSpan ? `**Span:** ${timelineSpan}` : '',
        pivotMoment ? `**Pivot moment:** ${pivotMoment}` : '',
        ``,
        `## Events`,
        ``,
    ].filter(l => l !== undefined);
    if (timelineEvents.length === 0) {
        lines.push('*No events recorded.*', '');
    }
    else {
        lines.push('| Date | Event | Cast | Significance | Source |', '|------|-------|------|--------------|--------|', ...timelineEvents.map(e => {
            const date = (e.date || '').replace(/\|/g, '/');
            const event = (e.event || '').replace(/\|/g, '/');
            const cast = (e.castInvolved || '').replace(/\|/g, '/');
            const sig = (e.significance || '').replace(/\|/g, '/');
            const src = (e.sourceNote || '').replace(/\|/g, '/');
            return `| ${date} | ${event} | ${cast} | ${sig} | ${src} |`;
        }), '');
    }
    return lines.join('\n');
}
async function saveTimeline(projectDir, data) {
    const dir = STORYLINE_DIR(projectDir);
    await ensureDir(dir);
    const json = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        timelineSpan: data.timelineSpan || null,
        pivotMoment: data.pivotMoment || null,
        events: (data.timelineEvents || []).map((e, i) => ({
            index: i + 1,
            date: e.date || null,
            event: e.event || null,
            castInvolved: e.castInvolved || null,
            significance: e.significance || null,
            sourceNote: e.sourceNote || null,
        })),
    };
    const jsonPath = (0, path_1.join)(dir, 'timeline.json');
    const mdPath = (0, path_1.join)(dir, 'timeline.md');
    await writeFile(jsonPath, JSON.stringify(json, null, 2), 'utf8');
    await writeFile(mdPath, formatTimelineMarkdown(data), 'utf8');
    return { jsonPath, mdPath, eventCount: json.events.length };
}
async function loadTimeline(projectDir) {
    const { pathExists, readFile } = fs_extra_1.default;
    const jsonPath = (0, path_1.join)(STORYLINE_DIR(projectDir), 'timeline.json');
    if (!(await pathExists(jsonPath)))
        return null;
    try {
        return JSON.parse(await readFile(jsonPath, 'utf8'));
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=timeline.js.map