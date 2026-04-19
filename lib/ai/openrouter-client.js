// AI client for story critique — uses OpenRouter (supports many models including free tiers)
import { request as httpsRequest } from 'node:http';
import { request as httpsRequestSecure } from 'node:https';

function getEnv(key, fallback = null) {
  return process.env[key] || fallback;
}

const OPENROUTER_API_KEY = getEnv('OPENROUTER_API_KEY');
const OPENROUTER_MODEL = getEnv('OPENROUTER_MODEL', 'google/gemini-2.0-flash-thinking-exp:free');
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Lazy API key getter — dotenv may not have loaded at module evaluation time
function getApiKey() {
  return process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;
}

async function makeRequest(messages, model, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${OPENROUTER_BASE_URL}/chat/completions`);
    const body = JSON.stringify({ model, messages, max_tokens: 1024 });

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = url.protocol === 'https:'
      ? httpsRequestSecure(options, (res) => resolveChunks(res, resolve, reject))
      : httpsRequest(options, (res) => resolveChunks(res, resolve, reject));

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function resolveChunks(res, resolve, reject) {
  let chunks = '';
  res.on('data', (chunk) => chunks += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(chunks);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.choices?.[0]?.message?.content || '');
    } catch (e) {
      reject(e);
    }
  });
}

// System prompt — the story expert voice
const SYSTEM_PROMPT = `You are a senior story editor specializing in Save the Cat beat structure, character-driven narrative, and dramatic tension.

Your role is to critique and suggest improvements for story elements — not to write the story, but to help the writer strengthen what they've already planned.

When critiquing:
- Focus on WHAT MAKES STORIES WORK: protagonist motivation clarity, beat function, stakes escalation, character arc consistency
- Use Save the Cat terminology naturally (whiff of death, midpoint flip, debate beat, promise of premise)
- Be specific — "the midpoint feels like a setback, not a reversal" is better than "needs more drama"
- Flag the SEVERITY: error (story breaks), warning (risky), suggestion (could be stronger)
- When something works, say so briefly — don't gild the lily

Format your critiques as:
- 🔴 ERROR: [specific problem and why it breaks the story]
- 🟡 WARNING: [risky choice and what could go wrong]
- 💡 SUGGESTION: [strengthen with specific alternative]

Be direct, practical, and rooted in what makes gripping novels work.`;

// User-facing critique prompts per stage
const CRITIQUE_PROMPTS = {
  genre: (state) => `
Review this genre selection:

Genre: ${state.genre?.primaryGenre} / ${state.genre?.subGenre || 'unspecified'}
Tone: ${state.genre?.tone || 'not set'}
Audience: ${state.genre?.audience || 'not set'}
Genre Variant: ${state.genre?.genreVariant || 'standard'}

Is the genre well-suited to the tone? Are there conflicts between genre expectations and stated tone? Any audience mismatch?
`,

  premise: (state) => `
Review this story seed:

Hook: ${state.premise?.conceptHook || 'not set'}
Raw seed: ${state.premise?.rawLogline?.substring(0, 500) || 'not set'}

Protagonist: ${state.protagonist?.name || 'not defined yet'}

Is the hook genuinely compelling? Does it promise a story worth reading? Is there enough conflict and stakes visible?
`,

  protagonist: (state) => `
Review this protagonist:

Name: ${state.protagonist?.name}
Age/Occupation: ${state.protagonist?.age || '?'} / ${state.protagonist?.occupation || '?'}

WANT (external goal): ${state.protagonist?.want || '[not set]'}
NEED (internal truth): ${state.protagonist?.need || '[not set]'}
GHOST (past wound): ${state.protagonist?.ghost || '[not set]'}
FLAW (self-deception): ${state.protagonist?.flaw || '[not set]'}
CORE LIE: ${state.protagonist?.coreLie || '[not set]'}
ARC: ${state.protagonist?.arcDirection || '[not set]'}

Check:
1. Want and Need are DIFFERENT — achieving the want without meeting the need means no growth
2. Ghost actively drives present behavior — not just backstory
3. Flaw must SABOTAGE the want — every time they're close, does the flaw make them self-destruct?
4. Arc direction is the direct opposite of the flaw
5. The core lie is the belief that fuels the flaw

Flag any issues with specificity and dramatic logic.
`,

  characters: (state) => `
Review this supporting cast:

${(state.characters || []).map((c, i) => `
${i + 1}. ${c.name} (${c.role})
   WANT: ${c.want}
   NEED: ${c.need}
   FLAW: ${c.flaw}
   Arc: ${c.arcSummary || 'not set'}
   Enters: ${c.meetsProtagonistAt || 'not set'}
`).join('\n')}

Each character needs their own want/need mini-arc that intersects with the protagonist's journey.
Are there enough compelling conflicts? Do the arcs justify their screen time?
`,

  logline: (state) => `
Review this logline:

"${state.logline?.sentence || '[not set]'}"

Setup: ${state.logline?.setup || '?'}
Inciting Incident: ${state.logline?.incitingIncident || '?'}
Stakes: ${state.logline?.stakes || '?'}
Resolution Hint: ${state.logline?.resolutionHint || '?'}

Does it have all 4 parts clearly? Does the inciting incident clearly disrupt the setup? Are stakes tangible and personal?
`,

  beatSheet: (state) => {
    const beats = state.beatSheet?.beats || {};
    return `
Review this beat sheet:

Genre variant: ${state.beatSheet?.genreVariant || 'standard'}

Key beats:
- Opening Image: ${beats.beat01OpeningImage?.scene || '[not set]'}
- Catalyst: ${beats.beat03Catalyst?.scene || '[not set]'}
- Break Into Two: ${beats.beat05BreakIntoTwo?.scene || '[not set]'} (commitment: ${beats.beat05BreakIntoTwo?.choice || '?'})
- Midpoint: ${beats.beat08Midpoint?.scene || '[not set]'}
  Type: ${beats.beat08Midpoint?.midpointType || '[not set]'}
  Flip/Reveal: ${beats.beat08Midpoint?.flipOrReveal || '[not set]'}
- All Is Lost: ${beats.beat10AllIsLost?.scene || '[not set]'}
  Whiff of Death: ${beats.beat10AllIsLost?.whiffOfDeath || '[not set]'}
- Break Into Three: ${beats.beat12Beat13?.scene || '[not set]'}
  Second Doorway: ${beats.beat12Beat13?.secondDoorway || '[not set]'}
- Finale: ${beats.beat13Finale?.scene || '[not set]'}
  Self-Revelation: ${beats.beat13Finale?.selfRevelation || '[not set]'}

Check:
1. Beat 5 is a real COMMITMENT, not "things happen to them"
2. Midpoint is either False Victory (they get what they want but it's terrible) or False Defeat (they learn crucial info in darkness) — not just "things get harder"
3. Beat 10 has a genuine WHIFF OF DEATH — something/someone lost
4. Beat 12 is EARNED through growth, not luck
5. Beat 13 proves transformation, not just skill
`;
  },

  bStory: (state) => `
Review this B story:

Character: ${state.bStory?.character || '[not set]'}
Premise: ${state.bStory?.premise || '[not set]'}
Arc: ${state.bStory?.arc || '[not set]'}
Theme Connection: ${state.bStory?.themeConnection || '[not set]'}

B story must:
- Mirror or contrast the A story's theme
- Have its own arc (setup → complication → resolution)
- Be seeded in Act 1, resolved in Act 3
- Carry the theme statement — often stated explicitly to the protagonist
`,

  subplots: (state) => `
Review these subplots:

${(state.subplots || []).map((sp, i) => `
${i + 1}. ${sp.name} (${sp.character})
   Purpose: ${sp.purpose}
   Premise: ${sp.premise}
   Setup: ${sp.beats?.setup || '[not set]'}
   Complication: ${sp.beats?.complication || '[not set]'}
   Resolution: ${sp.beats?.resolution || '[not set]'}
`).join('\n')}

Each subplot needs:
- Its own mini-arc (setup → complication → resolution)
- A clear purpose (echoes theme, raises stakes, develops character)
- Connection to the main story — not isolated

Are there too many? Do any feel like they dilute focus?
`,

  sceneOutline: (state) => `
Review this scene outline:

${(state.sceneOutline?.highLevel || []).map((s, i) => `${i + 1}. [${s.beat}] ${s.label}: ${s.summary || '[not set]'}`).join('\n')}

For each sequence:
- Does it have a clear purpose (advances plot / reveals character / raises stakes)?
- Is the dramatic question visible?
- Does something CHANGE by the end?
- Does it serve the beat's function?

Also check pacing:
- Act 1 should be roughly 25% (Setup through Break Into Two)
- Act 2 should be roughly 50% (Fun and Games through Black Moment)
- Act 3 should be roughly 25% (Break Into Three through Final Image)
`,

  plotThreads: (state) => `
Review this plot thread registry:

${(state.plotThreads || []).map(t => `- ${t.name} (${t.type}) — status: ${t.status} | resolves: ${t.resolutionPlan || '[not set]'}`).join('\n')}

Every thread must:
1. Be INTRODUCED at some point
2. BUILD (be active, create tension, matter)
3. Be RESOLVED (or explicitly abandoned with purpose)

Check: Are any threads dangling? Any that disappear without payoff?
`,

  chapterOutline: (state) => `
Review this chapter outline:

${(state.chapterOutline || []).map(ch => `
Chapter ${ch.chapterNumber}: ${ch.chapterTitle} (${ch.beat})
${ch.scenes.map(sc => `  Scene ${sc.sceneNumber}: ${sc.summary || '[not set]'} | POV: ${sc.pov} | What Changes: ${sc.whatChanges || '[not set]'}`).join('\n')}
`).join('\n')}

For each scene:
- Clear dramatic question?
- Someone changes — who and how?
- Advances a plot thread?
- POV is the right character for this moment?
- Conflict visible?
`,

  critique: (state) => `
You are reviewing flagged issues from a prior self-check:

${(state.critique?.flaggedIssues || []).map(i => `- [${i.type.toUpperCase()}] ${i.message}`).join('\n')}

For each, advise: accept as-is, fix now (with specific how), or investigate further.
`,

  relationships: (state) => `
Review these character relationships:

${(state.relationships || []).map(r => `- ${r.characterA} ↔ ${r.characterB}: ${r.connection || '[not set]'} | Conflict: ${r.conflict || '[not set]'}`).join('\n')}

Check:
1. Every major character has at least one relationship to the protagonist
2. Relationships involve conflict, dependency, or shared need — not just acquaintance
3. The protagonist's key relationships reflect their flaw (do they push away people they need? cling to people who hurt them?)
4. There are potential relationship arcs — connections that could change across the story
`,

  masterDoc: (state) => `
Review the overall planning completeness:

Genre: ${state.genre?.primaryGenre || '[not set]'}
Protagonist: ${state.protagonist?.name || '[not set]'}
Logline: ${state.logline?.sentence || '[not set]'}
Beats completed: ${Object.keys(state.beatSheet?.beats || {}).length}/15
Chapters outlined: ${(state.chapterOutline || []).length}
Plot threads: ${(state.plotThreads || []).length}

Is the planning complete enough to begin writing? Any gaps that would cause problems in the first draft?
`,
};

// Main function — call this from any stage to get critique
export async function aiCritique(stageId, state) {
  // Check for OpenRouter key
  if (!getApiKey()) {
    return ruleBasedCritique(stageId, state);
  }

  // Check if this stage has a critique prompt
  const promptFn = CRITIQUE_PROMPTS[stageId];
  if (!promptFn) {
    return 'No critique available for this stage yet.';
  }

  const userPrompt = promptFn(state);

  try {
    const response = await makeRequest([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], OPENROUTER_MODEL, getApiKey());

    return response;
  } catch (err) {
    console.error(chalk.red(`\nAI critique unavailable: ${err.message}\n`));
    return ruleBasedCritique(stageId, state);
  }
}
function ruleBasedCritique(stageId, state) {
  const issues = [];

  if (stageId === 'protagonist') {
    const p = state.protagonist;
    if (!p?.want) issues.push('🟡 WARNING: Protagonist has no stated WANT — what are they actively chasing?');
    if (!p?.need) issues.push('🟡 WARNING: Protagonist has no stated NEED — what emotional truth must they learn?');
    if (!p?.flaw) issues.push('🔴 ERROR: Protagonist has no FLAW — what self-deception blocks them from their need?');
    if (!p?.ghost) issues.push('🟡 WARNING: Protagonist\'s GHOST is empty — the past wound that created the flaw. Without this the arc feels unanchored.');
    if (p?.want && p?.need && p?.want.toLowerCase().includes(p.need.toLowerCase())) {
      issues.push('🔴 ERROR: WANT and NEED appear to be the same thing — they must be different. The protagonist must want something external but need something internal.');
    }
  }

  if (stageId === 'beatSheet') {
    const beats = state.beatSheet?.beats || {};
    if (!beats.beat05BreakIntoTwo?.choice) {
      issues.push('🔴 ERROR: Beat 5 (Break Into Two) has no commitment — the protagonist must CHOOSE to cross the threshold, not just be dragged into the new world.');
    }
    if (!beats.beat08Midpoint?.midpointType) {
      issues.push('🔴 ERROR: Beat 8 (Midpoint) has no type specified — must be either False Victory or False Defeat.');
    }
    if (!beats.beat10AllIsLost?.whiffOfDeath) {
      issues.push('🔴 ERROR: Beat 10 (All Is Lost) needs a "whiff of death" — something or someone precious is lost at this moment.');
    }
    if (beats.beat08Midpoint?.midpointType === 'falseVictory' && !beats.beat08Midpoint?.flipOrReveal) {
      issues.push('🟡 WARNING: False Victory midpoint needs a flip — what new problem does their success create?');
    }
  }

  if (stageId === 'logline') {
    const lg = state.logline;
    if (!lg?.sentence) issues.push('🟡 WARNING: No logline sentence yet.');
    if (!lg?.incitingIncident) issues.push('🟡 WARNING: Logline missing inciting incident — what disrupts the protagonist\'s world?');
    if (!lg?.stakes) issues.push('🟡 WARNING: Logline missing clear stakes — what do they stand to lose or gain?');
  }

  if (stageId === 'bStory') {
    if (!state.bStory?.character) issues.push('🟡 WARNING: No B story character identified yet.');
    if (!state.bStory?.arc) issues.push('🟡 WARNING: B story has no stated arc — how does it change across the story?');
  }

  if (issues.length === 0) {
    return '✅ Looking solid — no obvious issues from rule-based check. AI critique would give deeper analysis if OpenRouter API key is set.';
  }

  return issues.join('\n');
}

// Load .env if available
try {
  const { config } = await import('dotenv');
  config();
} catch {}