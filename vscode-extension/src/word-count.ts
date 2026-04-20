// Word counting for prose markdown. Code blocks are excluded (code isn't
// prose and shouldn't inflate the count). Markdown punctuation is treated
// as word separators so `**bold**` counts as one word "bold", not a mangled
// string. Headings (#) are also stripped from the word content but the
// text after them still counts.

export function countWords(markdown: string): number {
  if (!markdown) return 0;

  // Strip fenced code blocks and inline code first so their contents
  // never reach the word counter.
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ');

  // Treat markdown formatting characters as separators, not as part of words.
  // Apostrophes and hyphens are intentionally kept so "don't" and "forty-two"
  // count as single words.
  const stripped = withoutCode
    .replace(/[*_~#>|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped) return 0;

  // Split on whitespace and count non-empty tokens that contain at least one
  // letter or digit (filters out stray punctuation like em-dashes on their own).
  return stripped.split(' ').filter(tok => /[\p{L}\p{N}]/u.test(tok)).length;
}

// Short-form number for status bar display ("2,340", "18.2k", "184k").
export function formatWordCount(n: number): string {
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}
