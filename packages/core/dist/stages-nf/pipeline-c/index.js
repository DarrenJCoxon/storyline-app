"use strict";
// @ts-nocheck
// Pipeline C — How-To / Skill Ladder (Practical Skills)
// 11 stages. No sub-mode fork.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIPELINE_C_BY_ID = exports.PIPELINE_C_STAGES = void 0;
exports.runStage = runStage;
const stage_guides_nf_pipeline_c_js_1 = require("../../ai/stage-guides-nf-pipeline-c.js");
const narrative_voice_nf_js_1 = require("../../ai/narrative-voice-nf.js");
exports.PIPELINE_C_STAGES = [
    { index: 1, id: 'pc-skill', name: 'Target Skill' },
    { index: 2, id: 'pc-start-level', name: 'Reader Starting Level' },
    { index: 3, id: 'pc-end-state', name: 'End-State Competency' },
    { index: 4, id: 'pc-decompose', name: 'Skill Decomposition' },
    { index: 5, id: 'pc-prereqs', name: 'Prerequisite Graph' },
    { index: 6, id: 'pc-lessons', name: 'Lesson Plan' },
    { index: 7, id: 'pc-drills', name: 'Exercise / Drill Design' },
    { index: 8, id: 'pc-milestones', name: 'Milestone / Assessment Design' },
    { index: 9, id: 'pc-examples', name: 'Worked Examples & Common Mistakes' },
    { index: 10, id: 'pc-critique', name: 'Consistency & Critique' },
    { index: 11, id: 'pc-master', name: 'Master Document' },
];
exports.PIPELINE_C_BY_ID = Object.fromEntries(exports.PIPELINE_C_STAGES.map(s => [s.id, s]));
async function runStage(stageId, state) {
    const stage = exports.PIPELINE_C_BY_ID[stageId];
    if (!stage)
        return { error: `Unknown Pipeline C stage: ${stageId}` };
    const guide = (0, stage_guides_nf_pipeline_c_js_1.getPipelineCGuide)(stageId);
    const stageData = state?.nfStages?.[stageId] || {};
    const critique = state ? (0, narrative_voice_nf_js_1.buildPipelineCCritiqueSummary)(stageId, stageData, state.nfStages || {}) : null;
    return {
        status: 'ok',
        stage,
        guide,
        currentData: stageData,
        critique,
        stateSnapshot: state ? {
            mode: state.mode,
            pipeline: state.pipeline,
            subMode: state.subMode || null,
        } : null,
    };
}
//# sourceMappingURL=index.js.map