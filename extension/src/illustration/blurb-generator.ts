import * as fs from 'fs'
import * as path from 'path'
import type { AIProvider, Message } from '../ai/provider.js'

export interface BlurbContext {
  title: string
  author: string
  genre?: string
  premise?: string
  logline?: string
  protagonist?: { name?: string; want?: string; need?: string }
  beats?: { catalyst?: string; midpoint?: string; allIsLost?: string }
}

export function readBlurbContext(projectDir: string): BlurbContext {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.storyline', 'state.json'), 'utf-8'))
    return {
      title: state?._meta?.projectTitle ?? state?.projectName ?? 'Untitled',
      author: state?._meta?.authorName ?? '',
      genre: state?.genre?.primaryGenre ?? '',
      premise: state?.premise?.rawLogline ?? state?.premise?.conceptHook ?? '',
      logline: state?.logline?.sentence ?? '',
      protagonist: {
        name: state?.protagonist?.name ?? '',
        want: state?.protagonist?.want ?? '',
        need: state?.protagonist?.need ?? '',
      },
      beats: {
        catalyst:  state?.beatSheet?.beats?.catalyst?.scene  ?? '',
        midpoint:  state?.beatSheet?.beats?.midpoint?.scene  ?? '',
        allIsLost: state?.beatSheet?.beats?.allIsLost?.scene ?? '',
      },
    }
  } catch {
    return { title: 'Untitled', author: '' }
  }
}

const SYSTEM_PROMPT = `You are a book marketing expert. Write a compelling back-cover blurb of 150–200 words.

Rules:
- Hook: first line stops the scroll, genre-appropriate
- Introduce protagonist and world in one breath
- Establish the central conflict and stakes
- Tease the consequence of failure
- Close with a question or cliffhanger — never resolve it
- Present tense, third person
- No spoilers, no plot summary, no "in this thrilling tale of…"
- No author attribution at the end

Respond with the blurb text only — no explanations, no preamble, no quote marks around it.`

export async function generateBlurb(
  provider: AIProvider,
  context: BlurbContext,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const parts = [
    `Title: ${context.title}`,
    context.author ? `Author: ${context.author}` : null,
    context.genre ? `Genre: ${context.genre}` : null,
    context.premise ? `Premise: ${context.premise}` : null,
    context.logline ? `Logline: ${context.logline}` : null,
    context.protagonist?.name
      ? `Protagonist: ${context.protagonist.name}${context.protagonist.want ? ` — wants: ${context.protagonist.want}` : ''}${context.protagonist.need ? `; needs: ${context.protagonist.need}` : ''}`
      : null,
    context.beats?.catalyst ? `Catalyst: ${context.beats.catalyst}` : null,
    context.beats?.midpoint ? `Midpoint: ${context.beats.midpoint}` : null,
    context.beats?.allIsLost ? `All Is Lost: ${context.beats.allIsLost}` : null,
  ].filter(Boolean).join('\n')

  const messages: Message[] = [{ role: 'user', content: `Write a back-cover blurb for this book:\n\n${parts}` }]

  let result = ''
  const stream = provider.chat(messages, { model: '', systemPrompt: SYSTEM_PROMPT })
  for await (const chunk of stream) {
    result += chunk
    onChunk?.(chunk)
  }
  return result.trim()
}
