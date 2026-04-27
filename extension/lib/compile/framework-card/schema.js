// Framework Card schema and validation
// The framework block lives in state.nfStages['pa-framework'] for Pipeline A projects.
// All other pipelines (B, C) and fiction have no framework — skip gracefully.

export const FRAMEWORK_CARD_SCHEMA_VERSION = 1;

export const PLACEHOLDER_FRAMEWORK = {
  title: 'The Clarity Method',
  subtitle: 'How to Lead Without Losing People',
  modelName: 'The 4 Laws of Clear Leadership',
  principles: [
    { number: 1, name: 'Make It Visible', description: 'Clarity begins with naming what others avoid.' },
    { number: 2, name: 'Make It Honest', description: 'Honest signals outperform polished ones every time.' },
    { number: 3, name: 'Make It Simple', description: 'Complexity is where leadership goes to die.' },
    { number: 4, name: 'Make It Stick', description: 'Systems beat willpower. Build the environment.' },
  ],
  author: 'Jane Smith',
  coverAccent: '#1e3a5f',
};

export function validateFramework(fw) {
  const errors = [];

  if (!fw || typeof fw !== 'object') {
    return ['Framework block is missing or not an object'];
  }
  if (!fw.modelName) errors.push('Missing modelName (the named framework, e.g. "4 Laws of Behavior Change")');
  if (!fw.title)     errors.push('Missing title');
  if (!fw.author)    errors.push('Missing author');
  if (!Array.isArray(fw.principles) || fw.principles.length === 0) {
    errors.push('principles must be a non-empty array');
  } else {
    fw.principles.forEach((p, i) => {
      if (!p.name) errors.push(`Principle ${i + 1} missing name`);
    });
  }

  return errors;
}

export function hasFramework(state) {
  if (state?.mode !== 'nonfiction') return false;
  if (state?.pipeline !== 'A') return false;
  const fw = extractFramework(state);
  return fw !== null && validateFramework(fw).length === 0;
}

export function extractFramework(state) {
  if (!state) return null;

  // Primary source: pa-framework stage data
  const paFramework = state.nfStages?.['pa-framework'];
  if (paFramework?.modelName) {
    return {
      title:       paFramework.title       || state.nfStages?.['dna-title']?.workingTitle || '',
      subtitle:    paFramework.subtitle    || state.nfStages?.['dna-promise']?.subtitleDraft || '',
      modelName:   paFramework.modelName,
      principles:  paFramework.principles  || [],
      author:      paFramework.author      || '',
      coverAccent: paFramework.coverAccent || '#1e3a5f',
    };
  }

  return null;
}
