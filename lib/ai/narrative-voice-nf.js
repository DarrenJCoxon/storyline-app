// Critique logic for Non-Fiction Book DNA stages
// Mirrors narrative-voice.js pattern but for commercial NF concerns

const PIPELINE_LABELS = { A: 'Prescriptive', B: 'Narrative NF', C: 'How-To / Skill Ladder' };

// ─────────────────────────────────────────────────────────────────────────────
// Per-stage critique rules — each returns an array of { type, message }
// type: 'error' | 'warning' | 'tip'
// ─────────────────────────────────────────────────────────────────────────────

function critiqueDnaCategory(data) {
  const issues = [];
  if (!data.primaryCategory) {
    issues.push({ type: 'error', message: 'No primary category set. This is the commercial foundation — it must be precise.' });
  }
  if (!data.competitorTitle) {
    issues.push({ type: 'warning', message: 'No primary comp named. Knowing your primary comp is essential for differentiation throughout.' });
  }
  if (data.primaryCategory && data.primaryCategory.toLowerCase().includes('non-fiction')) {
    issues.push({ type: 'warning', message: '"Non-fiction" is not a category — it\'s a format. Go narrower: Self-Help, Business, Popular Science, etc.' });
  }
  return issues;
}

function critiqueDnaReader(data) {
  const issues = [];
  if (!data.avatarName) {
    issues.push({ type: 'warning', message: 'No name for the reader avatar. A named person forces more specific thinking.' });
  }
  const thinFields = ['demographics', 'alreadyTried', 'biggestFear', 'deepestWish']
    .filter(k => !data[k] || data[k].length < 30);
  if (thinFields.length > 1) {
    issues.push({ type: 'warning', message: `Reader avatar is thin on: ${thinFields.join(', ')}. These answers shape every chapter. Push deeper.` });
  }
  if (data.demographics && !/(year|age|\d0s|decade|career|job|work|married|parent|live|move)/i.test(data.demographics)) {
    issues.push({ type: 'tip', message: 'Demographics read as a type rather than a person. Add life context: where are they in their career or life stage?' });
  }
  if (data.deepestWish && data.deepestWish.length < 20) {
    issues.push({ type: 'warning', message: 'Deepest wish is too short — it\'s the emotional purchase. Expand it.' });
  }
  return issues;
}

function critiqueDnaTransform(data) {
  const issues = [];
  if (!data.transformationSentence) {
    issues.push({ type: 'error', message: 'No transformation sentence. This is the book\'s spine — every chapter must serve it.' });
  }
  if (data.transformationSentence && !/will\s+\w/i.test(data.transformationSentence)) {
    issues.push({ type: 'warning', message: 'Transformation sentence should be active: "After reading this, [reader] will [specific change]."' });
  }
  if (data.beforeState && data.afterState) {
    const beforeLen = data.beforeState.length;
    const afterLen = data.afterState.length;
    if (Math.abs(beforeLen - afterLen) > beforeLen * 0.8) {
      issues.push({ type: 'tip', message: 'Before and after states are very uneven in detail. Both deserve equal specificity.' });
    }
  }
  if (data.afterState && /(better|improve|successful|good)/i.test(data.afterState) && data.afterState.length < 80) {
    issues.push({ type: 'warning', message: 'After state uses vague language ("better", "successful"). Make it specific and concrete.' });
  }
  return issues;
}

function critiqueDnaIdea(data) {
  const issues = [];
  if (!data.bigIdea) {
    issues.push({ type: 'error', message: 'No Big Idea defined. This is the differentiator — without it, you\'re writing a topic book.' });
  }
  if (data.bigIdea && data.bigIdea.length < 30) {
    issues.push({ type: 'warning', message: 'Big Idea is too short to be specific. Expand until it names the mechanism, not just the outcome.' });
  }
  if (data.ideaSentence && !/(because|therefore|so that|which means|the reason)/i.test(data.ideaSentence)) {
    issues.push({ type: 'warning', message: 'Big Idea sentence lacks causal logic ("because", "therefore"). Without it, the idea is a claim, not an argument.' });
  }
  if (!data.whyDifferent) {
    issues.push({ type: 'error', message: 'Differentiation from comp not stated. If you can\'t name the gap, neither can a reader scrolling Amazon.' });
  }
  if (data.whyDifferent && /(better|more|less|new|fresh)/i.test(data.whyDifferent) && data.whyDifferent.length < 60) {
    issues.push({ type: 'tip', message: 'Differentiation uses comparative language ("better", "more") without specifics. Name exactly what\'s different.' });
  }
  return issues;
}

function critiqueDnaAuthor(data) {
  const issues = [];
  if (!data.credibilitySource) {
    issues.push({ type: 'error', message: 'No credibility source. Readers need to trust the author before they trust the argument.' });
  }
  if (!data.uniqueAccess) {
    issues.push({ type: 'warning', message: 'Unique access not defined. What do you have that others who wrote about this topic don\'t?' });
  }
  if (data.credibilitySource && /degree|qualified|expert|years/i.test(data.credibilitySource) && !data.uniqueAccess) {
    issues.push({ type: 'tip', message: 'Credentials alone aren\'t authority moat — lots of people have degrees. What did you see or do that others didn\'t?' });
  }
  return issues;
}

function critiqueDnaPromise(data) {
  const issues = [];
  if (!data.corePromise) {
    issues.push({ type: 'error', message: 'No core promise defined. The promise IS the product.' });
  }
  if (!data.subtitleDraft) {
    issues.push({ type: 'error', message: 'No subtitle draft. The subtitle is the most commercially important sentence in the book.' });
  }
  if (data.subtitleDraft) {
    const words = data.subtitleDraft.trim().split(/\s+/).length;
    if (words > 12) {
      issues.push({ type: 'warning', message: `Subtitle is ${words} words — aim for 10 or fewer. Shorter subtitles display better on Amazon and spines.` });
    }
  }
  if (data.corePromise && /(understand|learn|discover|explore)/i.test(data.corePromise)) {
    issues.push({ type: 'warning', message: 'Promise uses passive verbs ("understand", "learn"). Stronger promises name a concrete outcome or capability.' });
  }
  return issues;
}

function critiqueDnaComps(data) {
  const issues = [];
  const comps = Array.isArray(data.comps) ? data.comps : [];
  if (comps.length === 0) {
    issues.push({ type: 'error', message: 'No comps listed. Comps define your market position.' });
  } else if (comps.length < 3) {
    issues.push({ type: 'warning', message: `Only ${comps.length} comp(s). Aim for 3–5 to properly map the competitive landscape.` });
  }
  const withoutGap = comps.filter(c => !c.yourGap || c.yourGap.length < 20);
  if (withoutGap.length > 0) {
    issues.push({ type: 'warning', message: `${withoutGap.length} comp(s) have no gap analysis. Without the gap, the comp is just a list.` });
  }
  if (!data.marketGap) {
    issues.push({ type: 'error', message: 'No market gap sentence. This single sentence is what you say to agents, editors, and readers.' });
  }
  return issues;
}

function critiqueDnaVoice(data) {
  const issues = [];
  if (!data.voiceRegister) {
    issues.push({ type: 'error', message: 'No voice register. Without a register, voice drifts inconsistently across chapters.' });
  }
  if (!data.toneDescriptors) {
    issues.push({ type: 'warning', message: 'No tone descriptors. Three words shapes every editorial decision: word choice, sentence length, anecdote selection.' });
  }
  if (data.toneDescriptors) {
    const descriptors = data.toneDescriptors.split(/[,;\/]/).map(d => d.trim()).filter(Boolean);
    if (descriptors.length < 2) {
      issues.push({ type: 'tip', message: 'One tone descriptor isn\'t enough — you need contrast. "Direct" could mean harsh or clear. Add a modifier.' });
    }
  }
  return issues;
}

function critiqueDnaEvidence(data) {
  const issues = [];
  if (!data.evidenceTypes) {
    issues.push({ type: 'error', message: 'No evidence philosophy. "I\'ll figure it out while writing" produces inconsistent books.' });
  }
  if (!data.sourcingRigor) {
    issues.push({ type: 'warning', message: 'Sourcing rigor not specified. Decide now — it affects how you research, interview, and write.' });
  }
  if (data.evidenceTypes && /anecdote/i.test(data.evidenceTypes) && !/research|data|study|case/i.test(data.evidenceTypes)) {
    issues.push({ type: 'warning', message: 'Anecdote-only evidence is a credibility risk in prescriptive non-fiction. Consider adding research, data, or case studies.' });
  }
  return issues;
}

function critiqueDnaCommercial(data) {
  const issues = [];
  if (!data.bookPrimaryGoal) {
    issues.push({ type: 'error', message: 'No primary goal for the book. Without one, every marketing decision is arbitrary.' });
  }
  if (!data.successIn12Months) {
    issues.push({ type: 'warning', message: 'No 12-month success metric. Without a measurable target, you can\'t know if the book worked.' });
  }
  if (data.successIn12Months && /(well|good|great|popular|successful)/i.test(data.successIn12Months) && data.successIn12Months.length < 50) {
    issues.push({ type: 'warning', message: 'Success metric is too vague. Make it specific and measurable: units, engagements, revenue, speaking dates, etc.' });
  }
  return issues;
}

function critiqueDnaTitle(data) {
  const issues = [];
  if (!data.workingTitle) {
    issues.push({ type: 'error', message: 'No working title. Even a placeholder forces clarity.' });
  }
  if (!data.titleDoesJob) {
    issues.push({ type: 'warning', message: 'Title job-check not completed. Score each of the three jobs: attention, promise, category.' });
  }
  const titleWords = (data.workingTitle || '').trim().split(/\s+/);
  if (titleWords.length > 7) {
    issues.push({ type: 'tip', message: 'Title is long. Shorter titles (3–5 words) are more memorable. Push detail into the subtitle.' });
  }
  return issues;
}

function critiqueDnaConsolidate(data, allDnaData) {
  const issues = [];
  if (!data.elevatorPitch) {
    issues.push({ type: 'error', message: 'No elevator pitch. This is the book\'s logline — you need it.' });
  }
  if (!data.confirmedPipeline || !['A', 'B', 'C'].includes(data.confirmedPipeline)) {
    issues.push({ type: 'error', message: 'Pipeline not confirmed. Must be A, B, or C before Phase 1 begins.' });
  }
  if (!data.biggestRisk) {
    issues.push({ type: 'warning', message: 'Biggest risk not identified. Naming it now means you can address it in the plan.' });
  }
  if (data.elevatorPitch && data.elevatorPitch.length < 50) {
    issues.push({ type: 'warning', message: 'Elevator pitch is too short. It should contain: reader, problem, transformation, method, and differentiation.' });
  }
  // Cross-stage coherence checks
  const idea = allDnaData?.['dna-idea'];
  const promise = allDnaData?.['dna-promise'];
  if (idea?.bigIdea && promise?.corePromise) {
    const ideaWords = idea.bigIdea.toLowerCase().split(/\s+/).slice(0, 5);
    const promiseText = promise.corePromise.toLowerCase();
    const overlap = ideaWords.some(w => w.length > 4 && promiseText.includes(w));
    if (!overlap) {
      issues.push({ type: 'warning', message: 'Big Idea (Stage 4) and Core Promise (Stage 6) seem disconnected. They should share the same core argument.' });
    }
  }
  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline A critique rules
// ─────────────────────────────────────────────────────────────────────────────

function critiquePaThesis(data) {
  const issues = [];
  if (!data.thesis) {
    issues.push({ type: 'error', message: 'No thesis defined. The book needs a falsifiable claim — not a topic.' });
  }
  if (!data.thesisSentence) {
    issues.push({ type: 'error', message: 'No one-sentence thesis. This is the north star every chapter must serve.' });
  }
  if (data.thesis && /(productivity|wellness|success|better|improve)/i.test(data.thesis) && data.thesis.length < 60) {
    issues.push({ type: 'warning', message: 'Thesis uses vague outcome language. The best prescriptive theses name a mechanism, not just an outcome.' });
  }
  if (!data.thesisBefore || !data.thesisAfter) {
    issues.push({ type: 'warning', message: 'Before/after beliefs not fully mapped. These shape the argument arc.' });
  }
  return issues;
}

function critiquePaObjections(data) {
  const issues = [];
  const objs = Array.isArray(data.objections) ? data.objections : [];
  if (objs.length === 0) {
    issues.push({ type: 'error', message: 'No reader objections listed. A book that ignores doubt reads like a sales pitch.' });
  } else if (objs.length < 3) {
    issues.push({ type: 'warning', message: `Only ${objs.length} objection(s). Real readers have more. Aim for 3–5 genuinely adversarial objections.` });
  }
  const withoutResponse = objs.filter(o => !o.response || o.response.length < 20);
  if (withoutResponse.length > 0) {
    issues.push({ type: 'warning', message: `${withoutResponse.length} objection(s) have no substantive response. Each needs a real answer, not a dismissal.` });
  }
  return issues;
}

function critiquePaFramework(data) {
  const issues = [];
  if (!data.modelName) {
    issues.push({ type: 'error', message: 'No model name. The framework must be named and brandable.' });
  }
  const principles = Array.isArray(data.principles) ? data.principles : [];
  if (principles.length === 0) {
    issues.push({ type: 'error', message: 'No principles defined. The framework is the book.' });
  } else if (principles.length < 3) {
    issues.push({ type: 'warning', message: 'Fewer than 3 principles feels thin. Most successful frameworks have 4–7.' });
  } else if (principles.length > 9) {
    issues.push({ type: 'warning', message: `${principles.length} principles is a lot. Above 9, readers can't remember the framework — which defeats its purpose.` });
  }
  if (!data.subMode || !['argument', 'braid'].includes(data.subMode)) {
    issues.push({ type: 'error', message: 'Sub-mode not set. Must be "argument" or "braid" before proceeding.' });
  }
  const noNames = principles.filter(p => !p.name || p.name.length < 2);
  if (noNames.length > 0) {
    issues.push({ type: 'warning', message: `${noNames.length} principle(s) have no name. Named principles are more memorable and more marketable.` });
  }
  return issues;
}

function critiquePaPrinciples(data) {
  const issues = [];
  const details = Array.isArray(data.principleDetails) ? data.principleDetails : [];
  if (details.length === 0) {
    issues.push({ type: 'error', message: 'No principle details defined. This is the intellectual core of the book.' });
  }
  const noMechanism = details.filter(p => !p.mechanism || p.mechanism.length < 30);
  if (noMechanism.length > 0) {
    issues.push({ type: 'warning', message: `${noMechanism.length} principle(s) have no mechanism ("why it works"). The mechanism is what separates insight from assertion.` });
  }
  const noMistake = details.filter(p => !p.commonMistake);
  if (noMistake.length > 0) {
    issues.push({ type: 'tip', message: `${noMistake.length} principle(s) have no common mistake noted. These are often the most useful passages in prescriptive books.` });
  }
  return issues;
}

function critiquePaEvidence(data) {
  const issues = [];
  if (!data.thinnestEvidence) {
    issues.push({ type: 'error', message: 'Thinnest evidence not identified. You must name it and plan for it — ignoring weak evidence produces books that collapse under review.' });
  }
  if (data.thinnestEvidence && /(i'll figure|will research|tbd|later)/i.test(data.thinnestEvidence)) {
    issues.push({ type: 'warning', message: 'Plan for thin evidence is vague. Name the specific research or case study you\'ll add, or acknowledge it as a book limitation.' });
  }
  return issues;
}

function critiquePaApplication(data) {
  const issues = [];
  const apps = Array.isArray(data.applicationByPrinciple) ? data.applicationByPrinciple : [];
  if (apps.length === 0) {
    issues.push({ type: 'error', message: 'No application defined. Without concrete actions, this is theory, not a prescriptive book.' });
  }
  const noAction = apps.filter(a => !a.primaryAction || a.primaryAction.length < 20);
  if (noAction.length > 0) {
    issues.push({ type: 'warning', message: `${noAction.length} principle(s) have vague or missing primary actions. Each action must be specific enough to do on Monday morning.` });
  }
  if (!data.quickWin) {
    issues.push({ type: 'warning', message: 'No quick win defined. The early quick win is what converts readers into finishers.' });
  }
  if (!data.implementationSequence) {
    issues.push({ type: 'warning', message: 'Implementation sequence not addressed. Readers need to know where to start.' });
  }
  return issues;
}

function critiquePaBraid(data) {
  const issues = [];
  if (!data.braidStory) {
    issues.push({ type: 'error', message: 'No braid story defined. In braid mode, the personal narrative is structural — not optional decoration.' });
  }
  const beats = Array.isArray(data.braidBeats) ? data.braidBeats : [];
  if (beats.length < 3) {
    issues.push({ type: 'warning', message: 'Fewer than 3 story beats. The braid needs at least: opening moment, crisis/turn, resolution.' });
  }
  if (!data.braidResolution) {
    issues.push({ type: 'error', message: 'No braid resolution. The personal story must resolve — it earns the argument\'s conclusion.' });
  }
  return issues;
}

function critiquePaChapters(data) {
  const issues = [];
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  if (chapters.length === 0) {
    issues.push({ type: 'error', message: 'No chapter plan. The plan is not complete without it.' });
  }
  const noJob = chapters.filter(c => !c.job || c.job.length < 15);
  if (noJob.length > 0) {
    issues.push({ type: 'warning', message: `${noJob.length} chapter(s) have no defined job. Every chapter must earn its place with a specific argumentative function.` });
  }
  const noPrinciple = chapters.filter(c => !c.linkedPrinciple);
  if (noPrinciple.length > 1) {
    issues.push({ type: 'tip', message: `${noPrinciple.length} chapter(s) have no linked principle. Body chapters should map to framework principles.` });
  }
  return issues;
}

function critiquePaOpener(data) {
  const issues = [];
  if (!data.openerScene) {
    issues.push({ type: 'error', message: 'No opening scene. The opener must make the reader\'s pain viscerally real.' });
  }
  if (!data.openerHook) {
    issues.push({ type: 'error', message: 'No hook defined. The hook is what makes readers commit to the whole book.' });
  }
  if (!data.closerVision) {
    issues.push({ type: 'warning', message: 'No closing vision. The closer paints the transformation in specific, earned terms.' });
  }
  if (!data.closerAction) {
    issues.push({ type: 'warning', message: 'No final action. The last instruction must be clear and immediately actionable.' });
  }
  if (data.openerScene && /many people|most people|everyone/i.test(data.openerScene)) {
    issues.push({ type: 'tip', message: 'Opening scene uses generalising language. The best openers feature one specific person in one specific moment.' });
  }
  return issues;
}

function critiquePaCritique(data) {
  const issues = [];
  if (!data.thesisDriftCheck) {
    issues.push({ type: 'error', message: 'Thesis drift check not completed. This is the most important structural check.' });
  }
  if (!data.critiqueSummary) {
    issues.push({ type: 'warning', message: 'No critique summary. Name the biggest remaining structural risk.' });
  }
  if (data.frameworkCoherenceCheck && /(no overlap|no gaps|all good|fine)/i.test(data.frameworkCoherenceCheck) && data.frameworkCoherenceCheck.length < 40) {
    issues.push({ type: 'tip', message: 'Framework coherence check looks dismissive. Be specific: name which principles were checked and what was found.' });
  }
  return issues;
}

const PA_CRITIQUERS = {
  'pa-thesis':      critiquePaThesis,
  'pa-objections':  critiquePaObjections,
  'pa-framework':   critiquePaFramework,
  'pa-principles':  critiquePaPrinciples,
  'pa-evidence':    critiquePaEvidence,
  'pa-application': critiquePaApplication,
  'pa-braid':       critiquePaBraid,
  'pa-chapters':    critiquePaChapters,
  'pa-opener':      critiquePaOpener,
  'pa-critique':    critiquePaCritique,
};

export function critiquePipelineAStage(stageId, data, allNfStages = {}) {
  const critiquer = PA_CRITIQUERS[stageId];
  if (!critiquer) return [];
  return critiquer(data, allNfStages);
}

export function buildPipelineACritiqueSummary(stageId, data, allNfStages) {
  const issues = critiquePipelineAStage(stageId, data, allNfStages);
  return {
    stageId,
    issueCount: issues.length,
    blocking: hasBlockingErrors(issues),
    issues,
    formatted: formatCritique(issues),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline B critique rules
// ─────────────────────────────────────────────────────────────────────────────

function critiquePbThesis(data) {
  const issues = [];
  if (!data.centralQuestion) {
    issues.push({ type: 'error', message: 'No central question. Narrative non-fiction is driven by a question — without it, the book has no spine.' });
  }
  if (!data.thesis) {
    issues.push({ type: 'error', message: 'No thesis. Even if your thesis emerges from research, you need a working version now — it guides what you look for.' });
  }
  if (!data.readerTakeaway) {
    issues.push({ type: 'error', message: 'No reader takeaway. What does the reader believe after finishing this book that they didn\'t before?' });
  }
  if (data.centralQuestion && data.centralQuestion.length < 20) {
    issues.push({ type: 'warning', message: 'Central question is very short. A good central question is specific enough to research, broad enough to sustain a book.' });
  }
  if (data.thesis && /how to|step|tip|guide/i.test(data.thesis)) {
    issues.push({ type: 'warning', message: 'Thesis reads as instructional ("how to", "steps"). Narrative NF theses are analytical, not prescriptive — they explain or reveal, not instruct.' });
  }
  return issues;
}

function critiquePbCast(data) {
  const issues = [];
  if (!data.primarySubject) {
    issues.push({ type: 'error', message: 'No primary subject. Even idea-led narrative NF has a primary lens — a person, group, or case through which the story is told.' });
  }
  const cast = Array.isArray(data.cast) ? data.cast : [];
  if (cast.length === 0) {
    issues.push({ type: 'error', message: 'No cast listed. Real people are the engine of narrative non-fiction — readers follow people, not ideas.' });
  } else if (cast.length < 3) {
    issues.push({ type: 'warning', message: `Only ${cast.length} cast member(s). Most narrative NF benefits from 3–8 key figures to sustain 250+ pages.` });
  }
  const noSource = cast.filter(c => !c.primarySource || c.primarySource.length < 10);
  if (noSource.length > 0) {
    issues.push({ type: 'warning', message: `${noSource.length} cast member(s) have no primary source identified. Every person needs a sourcing strategy.` });
  }
  const noGap = cast.filter(c => !c.sourcingGap);
  if (noGap.length > 0) {
    issues.push({ type: 'tip', message: `${noGap.length} cast member(s) have no sourcing gap noted. Gaps you don't name are risks you won't plan for.` });
  }
  return issues;
}

function critiquePbTimeline(data) {
  const issues = [];
  const events = Array.isArray(data.timelineEvents) ? data.timelineEvents : [];
  if (events.length === 0) {
    issues.push({ type: 'error', message: 'No timeline events. The timeline is your scaffolding — scenes, chapters, and cause-and-effect depend on it.' });
  } else if (events.length < 5) {
    issues.push({ type: 'warning', message: `Only ${events.length} timeline event(s). A sparse timeline usually signals incomplete research.` });
  }
  if (!data.timelineSpan) {
    issues.push({ type: 'error', message: 'No timeline span defined. The span tells you how much history the book must hold.' });
  }
  if (!data.pivotMoment) {
    issues.push({ type: 'error', message: 'No pivot moment identified. Every narrative non-fiction has a fulcrum — the event everything else turns on.' });
  }
  const noSource = events.filter(e => !e.sourceNote || e.sourceNote.length < 5);
  if (noSource.length > 1) {
    issues.push({ type: 'warning', message: `${noSource.length} event(s) have no source note. Undocumented events are placeholder research, not facts.` });
  }
  return issues;
}

function critiquePbFork(data) {
  const issues = [];
  if (!data.subMode || !['idea-led', 'event-led'].includes(data.subMode)) {
    issues.push({ type: 'error', message: 'Structural fork not decided. Must be "idea-led" or "event-led" — this shapes every downstream chapter decision.' });
  }
  if (!data.forkRationale || data.forkRationale.length < 30) {
    issues.push({ type: 'error', message: 'No fork rationale. The structure must serve the material — explain why this form fits this content.' });
  }
  return issues;
}

function critiquePbScenes(data) {
  const issues = [];
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  if (scenes.length === 0) {
    issues.push({ type: 'error', message: 'No scenes. Scenes are the proof in narrative non-fiction. Without them, you have essays, not narrative.' });
  } else if (scenes.length < 5) {
    issues.push({ type: 'warning', message: `Only ${scenes.length} scene(s). A full-length book typically needs 20–40 distinct scenes across chapters.` });
  }
  const noSource = scenes.filter(s => !s.source || s.source.length < 5);
  if (noSource.length > 0) {
    issues.push({ type: 'warning', message: `${noSource.length} scene(s) have no source identified. Unsourced scenes are a fact-checking liability.` });
  }
  if (!data.missingScenes || data.missingScenes.length < 20) {
    issues.push({ type: 'error', message: 'Scene gaps not identified. You must name where you\'re research-thin — those are your most important research targets.' });
  }
  return issues;
}

function critiquePbSourcing(data) {
  const issues = [];
  if (!data.sourcingStrategy) {
    issues.push({ type: 'error', message: 'No sourcing strategy. A narrative non-fiction without a sourcing philosophy can\'t be defended after publication.' });
  }
  if (!data.sourcingGaps || data.sourcingGaps.length < 30) {
    issues.push({ type: 'error', message: 'Sourcing gaps not identified. Name your weakest scenes and your plan for each — vague "I\'ll research more" is not a plan.' });
  }
  if (data.sourcingStrategy && data.sourcingStrategy.length < 40) {
    issues.push({ type: 'warning', message: 'Sourcing strategy is thin. Specify: primary or secondary research, interview approach, archive access, citation format.' });
  }
  return issues;
}

function critiquePbTheme(data) {
  const issues = [];
  if (!data.primaryTheme) {
    issues.push({ type: 'error', message: 'No primary theme. The theme is what the book is really about — without it, you\'re writing journalism, not narrative non-fiction.' });
  }
  if (!data.emotionalArc) {
    issues.push({ type: 'error', message: 'No emotional arc. The reader follows emotion, not events. What does the reader feel at the end that they didn\'t at the start?' });
  }
  if (!data.themeInClosingChapter) {
    issues.push({ type: 'error', message: 'Theme in closing chapter not specified. The closing must earn the theme — not state it.' });
  }
  if (data.primaryTheme && /the story of|about how|explores/i.test(data.primaryTheme)) {
    issues.push({ type: 'warning', message: 'Primary theme describes the subject, not the universal idea. The theme should apply beyond this specific case.' });
  }
  return issues;
}

function critiquePbChapters(data) {
  const issues = [];
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  if (chapters.length === 0) {
    issues.push({ type: 'error', message: 'No chapter outline. Without it, the book has no architecture.' });
  } else if (chapters.length < 5) {
    issues.push({ type: 'warning', message: `Only ${chapters.length} chapter(s). Most narrative non-fiction runs 10–20 chapters.` });
  }
  if (!data.momentumNote || data.momentumNote.length < 30) {
    issues.push({ type: 'error', message: 'Momentum note missing or too thin. Name the specific energy dips and explain why they\'re intentional.' });
  }
  const noAnchor = chapters.filter(c => !c.anchorScene);
  if (noAnchor.length > 1) {
    issues.push({ type: 'warning', message: `${noAnchor.length} chapter(s) have no anchor scene. Every chapter needs a central vivid moment to organise around.` });
  }
  const noQuestion = chapters.filter(c => !c.chapterQuestion);
  if (noQuestion.length > 1) {
    issues.push({ type: 'tip', message: `${noQuestion.length} chapter(s) have no chapter question. Chapters that ask a question are easier to write and edit than chapters that just cover a topic.` });
  }
  return issues;
}

function critiquePbCritique(data) {
  const issues = [];
  if (!data.sourcingCoverageCheck) {
    issues.push({ type: 'error', message: 'Sourcing coverage check not completed. You must walk every scene and confirm or name the sourcing gap.' });
  }
  if (!data.momentumCheck) {
    issues.push({ type: 'error', message: 'Momentum check not completed. Pacing failures in narrative NF kill books that are otherwise well-researched.' });
  }
  if (!data.themeDeliveryCheck) {
    issues.push({ type: 'error', message: 'Theme delivery check not completed. A stated theme is an essay. A shown theme is narrative non-fiction.' });
  }
  if (!data.centralQuestionAnsweredCheck) {
    issues.push({ type: 'error', message: 'Central question check not completed. If the closing chapter doesn\'t answer the question from Stage 1, the book fails its own premise.' });
  }
  if (!data.critiqueSummary) {
    issues.push({ type: 'warning', message: 'No critique summary. Name the single biggest structural risk before drafting begins.' });
  }
  return issues;
}

const PB_CRITIQUERS = {
  'pb-thesis':   critiquePbThesis,
  'pb-cast':     critiquePbCast,
  'pb-timeline': critiquePbTimeline,
  'pb-fork':     critiquePbFork,
  'pb-scenes':   critiquePbScenes,
  'pb-sourcing': critiquePbSourcing,
  'pb-theme':    critiquePbTheme,
  'pb-chapters': critiquePbChapters,
  'pb-critique': critiquePbCritique,
};

export function critiquePipelineBStage(stageId, data, allNfStages = {}) {
  const critiquer = PB_CRITIQUERS[stageId];
  if (!critiquer) return [];
  return critiquer(data, allNfStages);
}

export function buildPipelineBCritiqueSummary(stageId, data, allNfStages) {
  const issues = critiquePipelineBStage(stageId, data, allNfStages);
  return {
    stageId,
    issueCount: issues.length,
    blocking: hasBlockingErrors(issues),
    issues,
    formatted: formatCritique(issues),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline C critique rules
// ─────────────────────────────────────────────────────────────────────────────

function critiquePcSkill(data) {
  const issues = [];
  if (!data.targetSkill) {
    issues.push({ type: 'error', message: 'No target skill defined. A how-to book must teach exactly one bounded, learnable skill.' });
  }
  if (!data.competencyDefinition) {
    issues.push({ type: 'error', message: 'No competency definition. Without it, the book has no success criterion — for you or the reader.' });
  }
  if (!data.whyThisSkill) {
    issues.push({ type: 'error', message: 'Why a full book not answered. If you can\'t justify the scope, the book may be too narrow for the format.' });
  }
  if (data.targetSkill && data.targetSkill.split(' ').length <= 2 && data.targetSkill.length < 20) {
    issues.push({ type: 'warning', message: 'Target skill reads as a topic, not a skill. Add domain, context, or constraint. "Cooking" → "Cooking French classics at home without professional equipment".' });
  }
  if (data.competencyDefinition && /(understand|feel|know|appreciate)/i.test(data.competencyDefinition)) {
    issues.push({ type: 'warning', message: 'Competency definition uses internal-state language ("understand", "feel"). Competency is behavioural — what can the reader DO?' });
  }
  return issues;
}

function critiquePcStartLevel(data) {
  const issues = [];
  if (!data.startingLevel || data.startingLevel.length < 30) {
    issues.push({ type: 'error', message: 'Starting level not described in enough detail. "Beginner" is not enough — describe what a beginner in this specific skill knows and can do.' });
  }
  if (!data.assumedKnowledge) {
    issues.push({ type: 'error', message: 'Assumed knowledge not stated. Unacknowledged assumptions are the most common source of reader confusion and negative reviews.' });
  }
  if (data.assumedKnowledge && /(none|nothing|no knowledge|zero)/i.test(data.assumedKnowledge) && data.assumedKnowledge.length < 30) {
    issues.push({ type: 'tip', message: 'You claim zero assumed knowledge — verify this is true. Even "zero-knowledge" books assume literacy, numeracy, or access to specific materials.' });
  }
  return issues;
}

function critiquePcEndState(data) {
  const issues = [];
  if (!data.endStateDescription) {
    issues.push({ type: 'error', message: 'No end-state description. This is the contract with the reader — without it, every scope decision is arbitrary.' });
  }
  if (!data.measurableOutcome) {
    issues.push({ type: 'error', message: 'No measurable outcome. The reader needs a test they can apply: can I do X in Y minutes? If not, the book can\'t be evaluated.' });
  }
  if (data.measurableOutcome && /(understand|know|appreciate|be familiar)/i.test(data.measurableOutcome)) {
    issues.push({ type: 'warning', message: 'Measurable outcome uses knowledge language, not performance language. Restate as a demonstrable task: "build", "write", "cook", "negotiate".' });
  }
  if (data.endStateDescription && !data.expertCeiling) {
    issues.push({ type: 'tip', message: 'Expert ceiling not defined. Knowing where the book stops builds trust. "This book takes you to competent, not expert" is more credible than vague ambition.' });
  }
  return issues;
}

function critiquePcDecompose(data) {
  const issues = [];
  const subSkills = Array.isArray(data.subSkills) ? data.subSkills : [];
  if (subSkills.length === 0) {
    issues.push({ type: 'error', message: 'No sub-skills defined. Without the skill decomposition, there is no skill tree and no lesson plan.' });
  } else if (subSkills.length < 4) {
    issues.push({ type: 'warning', message: `Only ${subSkills.length} sub-skill(s). Fewer than 4 suggests the skill isn\'t decomposed finely enough to teach chapter by chapter.` });
  } else if (subSkills.length > 20) {
    issues.push({ type: 'warning', message: `${subSkills.length} sub-skills is a lot for a single book. Above 20, consider whether some should be grouped or whether this is two books.` });
  }
  if (!data.coreSubSkill) {
    issues.push({ type: 'error', message: 'Most foundational sub-skill not identified. You must know what to teach first.' });
  }
  const noDescription = subSkills.filter(s => !s.description || s.description.length < 10);
  if (noDescription.length > 0) {
    issues.push({ type: 'warning', message: `${noDescription.length} sub-skill(s) have no description of what mastery looks like. Mastery definitions are what make lessons testable.` });
  }
  return issues;
}

function critiquePcPrereqs(data) {
  const issues = [];
  const edges = Array.isArray(data.prereqEdges) ? data.prereqEdges : [];
  if (edges.length === 0) {
    issues.push({ type: 'error', message: 'No prerequisite relationships defined. Without edges, the skill tree is a flat list — no learning order, no graph validation.' });
  }
  if (!data.rootSkills || data.rootSkills.length < 5) {
    issues.push({ type: 'warning', message: 'Root skills (entry points) not clearly identified. The reader needs to know where to start.' });
  }
  const noRequires = edges.filter(e => !e.requires || e.requires.length === 0);
  if (noRequires.length === edges.length && edges.length > 0) {
    issues.push({ type: 'warning', message: 'All prerequisite edges have empty "requires" fields. Run `nf skill-tree` after adding actual relationships.' });
  }
  return issues;
}

function critiquePcLessons(data) {
  const issues = [];
  const lessons = Array.isArray(data.lessons) ? data.lessons : [];
  if (lessons.length === 0) {
    issues.push({ type: 'error', message: 'No lesson plan defined. Without lessons, there\'s no teaching structure.' });
  }
  const noObjective = lessons.filter(l => !l.learningObjective || l.learningObjective.length < 20);
  if (noObjective.length > 0) {
    issues.push({ type: 'warning', message: `${noObjective.length} lesson(s) have no learning objective. A lesson without a "the reader can..." statement is a topic, not a lesson.` });
  }
  const noDrill = lessons.filter(l => !l.drillType);
  if (noDrill.length > 1) {
    issues.push({ type: 'warning', message: `${noDrill.length} lesson(s) have no drill type planned. Every lesson needs practice, not just explanation.` });
  }
  return issues;
}

function critiquePcDrills(data) {
  const issues = [];
  const drills = Array.isArray(data.drills) ? data.drills : [];
  if (drills.length === 0) {
    issues.push({ type: 'error', message: 'No drills defined. Without drills, this is an explanation book, not a how-to book.' });
  }
  const vague = drills.filter(d => !d.task || d.task.length < 30 || /(practice|explore|try|experiment with)/i.test(d.task));
  if (vague.length > 0) {
    issues.push({ type: 'warning', message: `${vague.length} drill(s) have vague tasks. Every drill must be specific enough to attempt without a coach.` });
  }
  const noOutcome = drills.filter(d => !d.expectedOutcome || d.expectedOutcome.length < 20);
  if (noOutcome.length > 0) {
    issues.push({ type: 'warning', message: `${noOutcome.length} drill(s) have no expected outcome. If the reader can\'t assess their own result, the drill is incomplete.` });
  }
  const noMistake = drills.filter(d => !d.commonMistake);
  if (noMistake.length > 1) {
    issues.push({ type: 'tip', message: `${noMistake.length} drill(s) have no common mistake noted. The most useful feedback a how-to book gives is "here\'s what getting it wrong looks like".` });
  }
  return issues;
}

function critiquePcMilestones(data) {
  const issues = [];
  const milestones = Array.isArray(data.milestones) ? data.milestones : [];
  if (milestones.length === 0) {
    issues.push({ type: 'error', message: 'No milestones defined. Checkpoints are what separate a how-to book from a reference manual.' });
  }
  if (!data.finalAssessment || data.finalAssessment.length < 20) {
    issues.push({ type: 'error', message: 'No final assessment. The end-state competency from Stage 3 must be testable at the end of the book.' });
  }
  const noCriteria = milestones.filter(m => !m.passCriteria || m.passCriteria.length < 20);
  if (noCriteria.length > 0) {
    issues.push({ type: 'warning', message: `${noCriteria.length} milestone(s) have no pass criteria. A milestone without specific criteria is just a section divider.` });
  }
  return issues;
}

function critiquePcExamples(data) {
  const issues = [];
  const examples = Array.isArray(data.workedExamples) ? data.workedExamples : [];
  if (examples.length === 0) {
    issues.push({ type: 'error', message: 'No worked examples planned. Examples are where abstract technique becomes concrete practice.' });
  }
  if (!data.canonicalAntiPatterns || data.canonicalAntiPatterns.length < 30) {
    issues.push({ type: 'error', message: 'Anti-patterns not defined. Showing what failure looks like is often the most valuable content in a how-to book.' });
  }
  const noAntiPattern = examples.filter(e => !e.antiPatternNote);
  if (noAntiPattern.length > 1) {
    issues.push({ type: 'tip', message: `${noAntiPattern.length} example(s) have no anti-pattern note. Every worked example has a shadow version where the beginner goes wrong.` });
  }
  return issues;
}

function critiquePcCritique(data) {
  const issues = [];
  if (!data.skillTreeGapCheck) {
    issues.push({ type: 'error', message: 'Skill tree gap check not completed. Walk from the end-state competency backwards — every required sub-skill must be a node.' });
  }
  if (!data.drillSpecificityCheck) {
    issues.push({ type: 'error', message: 'Drill specificity check not completed. Walk the weakest drill and ask: could a reader attempt this without coaching?' });
  }
  if (!data.milestoneRigorCheck) {
    issues.push({ type: 'error', message: 'Milestone rigor check not completed. A milestone that anyone passes isn\'t gatekeeping anything.' });
  }
  if (!data.endStateDeliveryCheck) {
    issues.push({ type: 'error', message: 'End-state delivery check not completed. This is the most important check — does the book actually deliver what it promises?' });
  }
  if (!data.critiqueSummary) {
    issues.push({ type: 'warning', message: 'No critique summary. Name the single biggest pedagogical risk before drafting.' });
  }
  return issues;
}

const PC_CRITIQUERS = {
  'pc-skill':       critiquePcSkill,
  'pc-start-level': critiquePcStartLevel,
  'pc-end-state':   critiquePcEndState,
  'pc-decompose':   critiquePcDecompose,
  'pc-prereqs':     critiquePcPrereqs,
  'pc-lessons':     critiquePcLessons,
  'pc-drills':      critiquePcDrills,
  'pc-milestones':  critiquePcMilestones,
  'pc-examples':    critiquePcExamples,
  'pc-critique':    critiquePcCritique,
};

export function critiquePipelineCStage(stageId, data, allNfStages = {}) {
  const critiquer = PC_CRITIQUERS[stageId];
  if (!critiquer) return [];
  return critiquer(data, allNfStages);
}

export function buildPipelineCCritiqueSummary(stageId, data, allNfStages) {
  const issues = critiquePipelineCStage(stageId, data, allNfStages);
  return {
    stageId,
    issueCount: issues.length,
    blocking: hasBlockingErrors(issues),
    issues,
    formatted: formatCritique(issues),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

const CRITIQUERS = {
  'dna-category':    critiqueDnaCategory,
  'dna-reader':      critiqueDnaReader,
  'dna-transform':   critiqueDnaTransform,
  'dna-idea':        critiqueDnaIdea,
  'dna-author':      critiqueDnaAuthor,
  'dna-promise':     critiqueDnaPromise,
  'dna-comps':       critiqueDnaComps,
  'dna-voice':       critiqueDnaVoice,
  'dna-evidence':    critiqueDnaEvidence,
  'dna-commercial':  critiqueDnaCommercial,
  'dna-title':       critiqueDnaTitle,
  'dna-consolidate': critiqueDnaConsolidate,
};

export function critiqueBookDnaStage(stageId, data, allDnaData = {}) {
  const critiquer = CRITIQUERS[stageId];
  if (!critiquer) return [];
  return critiquer(data, allDnaData);
}

export function formatCritique(issues) {
  if (!issues || issues.length === 0) return '✓ No issues flagged for this stage.';
  const lines = issues.map(i => {
    const prefix = i.type === 'error' ? '✗' : i.type === 'warning' ? '⚠' : '→';
    return `${prefix} ${i.message}`;
  });
  return lines.join('\n');
}

export function hasBlockingErrors(issues) {
  return issues.some(i => i.type === 'error');
}

// Summary for the /storyline-nf skill's critique block
export function buildCritiqueSummary(stageId, data, allDnaData) {
  const issues = critiqueBookDnaStage(stageId, data, allDnaData);
  return {
    stageId,
    issueCount: issues.length,
    blocking: hasBlockingErrors(issues),
    issues,
    formatted: formatCritique(issues),
  };
}
