"use strict";
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
exports.generatePromisePayoffLedger = generatePromisePayoffLedger;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const promise_payoff_js_1 = require("../critique/promise-payoff.js");
const RISK_ORDER = { high: 0, medium: 1, low: 2 };
const STATUS_ORDER = { unresolved: 0, 'set-up': 1, planned: 2, 'paid-off': 3 };
function riskBadge(risk) {
    if (risk === 'high')
        return '🔴';
    if (risk === 'medium')
        return '🟡';
    return '🟢';
}
function chapterRef(ch, sc) {
    if (ch === null)
        return '—';
    return sc !== null ? `Ch ${ch}, Sc ${sc}` : `Ch ${ch}`;
}
function renderPromiseRow(p) {
    const setup = chapterRef(p.setupChapter, p.setupScene);
    const payoff = chapterRef(p.plannedPayoffChapter, p.plannedPayoffScene);
    const actual = p.actualPayoffChapter !== null ? chapterRef(p.actualPayoffChapter, p.actualPayoffScene) : '—';
    const badge = riskBadge(p.risk);
    return `| ${badge} | ${p.type} | ${p.description} | ${setup} | ${payoff} | ${actual} | ${p.status} |`;
}
function renderSection(title, items) {
    if (items.length === 0)
        return [];
    const lines = [`### ${title}`, '', '| Risk | Type | Promise | Set up | Planned payoff | Actual payoff | Status |', '|------|------|---------|--------|----------------|---------------|--------|'];
    for (const p of items)
        lines.push(renderPromiseRow(p));
    lines.push('');
    return lines;
}
function generatePromisePayoffLedger(plan, projectDir) {
    const outputDir = path.join(projectDir, 'planning');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'promise-payoff-ledger.md');
    const title = plan.title ?? 'Untitled';
    const all = [...plan.promises].sort((a, b) => {
        const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (statusDiff !== 0)
            return statusDiff;
        return RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
    });
    const unresolved = all.filter(p => p.status === 'unresolved');
    const setUp = all.filter(p => p.status === 'set-up');
    const planned = all.filter(p => p.status === 'planned');
    const paidOff = all.filter(p => p.status === 'paid-off');
    const highRisk = all.filter(p => p.risk === 'high');
    const gaps = (0, promise_payoff_js_1.findFictionPromiseGaps)(plan);
    const top3 = gaps.slice(0, 3);
    const lines = [
        `# Promise / Payoff Ledger — ${title}`,
        '',
        `*Generated: ${new Date().toISOString().split('T')[0]}*`,
        `*${all.length} promise${all.length !== 1 ? 's' : ''} tracked · ${highRisk.length} high risk · ${unresolved.length} unresolved*`,
        '',
    ];
    if (all.length === 0) {
        lines.push('*No plot threads found. Complete the Plot Thread Registry stage to populate this ledger.*', '');
    }
    else {
        if (top3.length > 0) {
            lines.push('## Risk Summary', '');
            for (const g of top3) {
                lines.push(`- **${g.promise.description}** (${g.promise.type}): ${g.gapDescription}`);
            }
            lines.push('');
        }
        lines.push('## Promise Tracker', '');
        lines.push(...renderSection('Unresolved', unresolved));
        lines.push(...renderSection('Set up (no resolution plan)', setUp));
        lines.push(...renderSection('Planned', planned));
        lines.push(...renderSection('Paid off', paidOff));
    }
    lines.push('---', '*Storyline Promise/Payoff Ledger — updated on every plot-thread or chapter save.*');
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
    return {
        outputPath,
        totalPromises: all.length,
        unresolvedCount: unresolved.length,
        highRiskCount: highRisk.length,
    };
}
//# sourceMappingURL=promise-payoff-ledger.js.map