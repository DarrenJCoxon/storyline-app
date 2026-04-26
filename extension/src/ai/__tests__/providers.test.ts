import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ManagedProvider } from '../managed-provider.js'
import { BYOKProvider } from '../byok-provider.js'
import { OllamaProvider } from '../ollama-provider.js'

// ── helpers ──────────────────────────────────────────────────────────────────

function sseChunks(chunks: string[]): string {
  return chunks
    .map(c => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}`)
    .concat(['data: [DONE]'])
    .join('\n\n')
}

function sseResponse(chunks: string[], status = 200): Response {
  return new Response(sseChunks(chunks), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function collect(iter: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of iter) out += chunk
  return out
}

const OPTS = { model: 'test-model', systemPrompt: 'You are helpful.' }
const MSGS = [{ role: 'user' as const, content: 'Hello' }]

// ── ManagedProvider ───────────────────────────────────────────────────────────

describe('ManagedProvider', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  const getLicenceKey = async () => 'SL-TEST-0000-0000-0001'

  it('streams chunks from SSE response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['Hello', ' World'])))
    const provider = new ManagedProvider('https://api.storyline.app', getLicenceKey)
    expect(await collect(provider.chat(MSGS, OPTS))).toBe('Hello World')
  })

  it('sends licence key in request body', async () => {
    const spy = vi.fn().mockResolvedValue(sseResponse(['ok']))
    vi.stubGlobal('fetch', spy)
    const provider = new ManagedProvider('https://api.storyline.app', getLicenceKey)
    await collect(provider.chat(MSGS, OPTS))
    const body = JSON.parse(spy.mock.calls[0][1].body)
    expect(body.licenceKey).toBe('SL-TEST-0000-0000-0001')
  })

  it('throws a user-facing message on 402 (credits exhausted)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 402 })))
    const provider = new ManagedProvider('https://api.storyline.app', getLicenceKey)
    await expect(collect(provider.chat(MSGS, OPTS))).rejects.toThrow('Credits exhausted')
  })

  it('throws on 401 (invalid licence key)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    const provider = new ManagedProvider('https://api.storyline.app', getLicenceKey)
    await expect(collect(provider.chat(MSGS, OPTS))).rejects.toThrow('Invalid licence key')
  })

  it('throws if no licence key is present', async () => {
    const provider = new ManagedProvider('https://api.storyline.app', async () => undefined)
    await expect(collect(provider.chat(MSGS, OPTS))).rejects.toThrow('No licence key')
  })

  it('isAvailable returns false when no licence key', async () => {
    const provider = new ManagedProvider('https://api.storyline.app', async () => undefined)
    expect(await provider.isAvailable()).toBe(false)
  })

  it('isAvailable returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const provider = new ManagedProvider('https://api.storyline.app', getLicenceKey)
    expect(await provider.isAvailable()).toBe(false)
  })
})

// ── BYOKProvider (OpenAI-compat) ──────────────────────────────────────────────

describe('BYOKProvider — openai', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  const config = { kind: 'openai' as const, apiKey: 'user-key', baseUrl: 'https://api.together.ai/v1' }

  it('streams chunks from SSE response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['chunk1', 'chunk2'])))
    const provider = new BYOKProvider(config)
    expect(await collect(provider.chat(MSGS, OPTS))).toBe('chunk1chunk2')
  })

  it('sends Authorization header', async () => {
    const spy = vi.fn().mockResolvedValue(sseResponse(['ok']))
    vi.stubGlobal('fetch', spy)
    await collect(new BYOKProvider(config).chat(MSGS, OPTS))
    expect(spy.mock.calls[0][1].headers.Authorization).toBe('Bearer user-key')
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })))
    await expect(collect(new BYOKProvider(config).chat(MSGS, OPTS))).rejects.toThrow('401')
  })
})

// ── BYOKProvider (Anthropic) ──────────────────────────────────────────────────

describe('BYOKProvider — anthropic', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  const config = { kind: 'anthropic' as const, apiKey: 'sk-ant-test' }

  function anthropicSseResponse(chunks: string[]): Response {
    const lines = chunks
      .map(c => `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: c } })}`)
      .join('\n\n')
    return new Response(lines, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  it('streams chunks from Anthropic SSE response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(anthropicSseResponse(['Hello', '!'])))
    expect(await collect(new BYOKProvider(config).chat(MSGS, OPTS))).toBe('Hello!')
  })

  it('sends x-api-key header', async () => {
    const spy = vi.fn().mockResolvedValue(anthropicSseResponse(['ok']))
    vi.stubGlobal('fetch', spy)
    await collect(new BYOKProvider(config).chat(MSGS, OPTS))
    expect(spy.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-test')
  })
})

// ── OllamaProvider ────────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('streams chunks from SSE response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['Local', ' response'])))
    expect(await collect(new OllamaProvider().chat(MSGS, OPTS))).toBe('Local response')
  })

  it('calls localhost:11434 by default', async () => {
    const spy = vi.fn().mockResolvedValue(sseResponse(['ok']))
    vi.stubGlobal('fetch', spy)
    await collect(new OllamaProvider().chat(MSGS, OPTS))
    expect(spy.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('isAvailable returns false when Ollama is not running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    expect(await new OllamaProvider().isAvailable()).toBe(false)
  })

  it('isAvailable returns true when /api/tags responds OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    expect(await new OllamaProvider().isAvailable()).toBe(true)
  })
})
