// Series potential detector — analyzes premise for multi-book signals.
// Called automatically by `storyline save premise`; result flows into the save
// JSON payload so the /storyline skill can raise it with the writer.

export function detectSeriesPotential(premiseData, genreData) {
  const indicators = [];

  if (premiseData?.rawLogline) {
    const logline = premiseData.rawLogline.toLowerCase();

    if (/\b(world|kingdom|realm|universe|city|guild)\b/.test(logline)) {
      indicators.push({ type: 'world', score: 'medium', reason: 'The premise centers on a world that could expand beyond this story.' });
    }

    if (/\b(first|young|apprentice|new recruit|just started)\b/.test(logline)) {
      indicators.push({ type: 'growth', score: 'high', reason: 'Protagonist is at the beginning of their journey — there\'s room to grow across books.' });
    }

    if (/\b(must find|search for|quest|journey|deliver)\b/.test(logline)) {
      indicators.push({ type: 'quest', score: 'medium', reason: 'Quest-based stories naturally lend themselves to multiple installments.' });
    }

    if (/\b(organization|agency|corporation|institution|system)\b/.test(logline)) {
      indicators.push({ type: 'serial', score: 'medium', reason: 'Institutional antagonists can recur across multiple stories.' });
    }

    const seriesFriendlyGenres = ['fantasy', 'sci-fi', 'science fiction', 'thriller', 'mystery', 'romance', 'middle grade'];
    if (genreData?.primaryGenre && seriesFriendlyGenres.includes(genreData.primaryGenre.toLowerCase())) {
      indicators.push({ type: 'genre', score: 'medium', reason: `${genreData.primaryGenre} readers often expect series — they want to return to this world.` });
    }

    if (premiseData?.conceptHook && premiseData.conceptHook.length > 200) {
      indicators.push({ type: 'complexity', score: 'low', reason: 'This premise has many threads — you might find some need more space than one book allows.' });
    }
  }

  const hasHighIndicator = indicators.some(i => i.score === 'high');
  const mediumCount = indicators.filter(i => i.score === 'medium').length;

  return {
    detected: hasHighIndicator || mediumCount >= 2,
    indicators,
    suggestion: hasHighIndicator
      ? 'This story has strong series potential. We could plan for 2-3 books now, with an overall arc across them.'
      : mediumCount >= 1
        ? 'There might be room for more than one book here. We can decide later once the first story is fully planned.'
        : null,
  };
}
