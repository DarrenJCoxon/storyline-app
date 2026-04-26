"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINK_TYPES = exports.ITEM_SUBTYPES = exports.VERIFICATION_STATES = exports.RELIABILITY_TIERS = exports.SCHEMA_VERSION = void 0;
// @ts-nocheck
exports.SCHEMA_VERSION = 1;
exports.RELIABILITY_TIERS = ['primary', 'peer-reviewed', 'secondary', 'anecdotal'];
exports.VERIFICATION_STATES = ['verified', 'pending', 'disputed', 'needs-follow-up'];
exports.ITEM_SUBTYPES = [
    'note', // general observation or background note
    'quote', // direct quotation from a source
    'statistic', // numerical claim requiring citation
    'case-study', // detailed example of a phenomenon
    'interview', // from a first-hand interview or conversation
    'sourced-claim', // Pipeline B: claim requiring source citation
    'worldbuilding', // fiction: setting, culture, technology
    'period', // fiction: historical period accuracy
    'profession', // fiction: character profession research
];
// Link targets used in item.links[]. Format: <type>:<identifier>
// chapter:5        → chapter 5
// scene:ch5-s2     → chapter 5, scene 2
// stage:beatSheet  → planning stage
// claim:<id>       → sourced claim (Pipeline B)
exports.LINK_TYPES = ['chapter', 'scene', 'stage', 'claim'];
//# sourceMappingURL=schema.js.map