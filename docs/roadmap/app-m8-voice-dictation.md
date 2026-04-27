# M8 — Voice Dictation (Wispr-style)

## Goal

Wispr-grade voice input directly inside the planning chat box. Writers who think out loud — which most novelists do during planning — can dictate naturally with low latency, accurate transcription, and clean output. The bar is "as good as Wispr Flow, in our environment, without leaving the editor".

Sequencing: ships after M6.5 (installer) is in writers' hands. Voice is a major UX upgrade for the planning loop, but it depends on a working installed product to validate against real usage.

## Why this matters

Planning a book is a thinking activity. Typing slows you down — you self-edit before the idea is out. Wispr Flow has shown that frictionless dictation in any text field unlocks a different mode of working: faster, looser, more exploratory. For Storyline's planning harness — which already encourages conversational thinking — voice is the natural input.

The competitive frame: a Wispr Flow subscription is $12/month. Storyline can offer better-quality dictation specifically for novelists (because we know your characters' names) bundled into the existing credit pool, with no extra subscription.

## Quality target — what "Wispr-grade" means here

Three components, all required:

1. **Accurate transcription** of fast, semi-articulated speech with domain vocabulary
2. **Filler-word and false-start cleanup** — "um, uh, like, you know, actually wait no" stripped without changing meaning
3. **Low perceived latency** — text starts appearing within ~1s of stopping

Skip any one and the result feels like a half-built version of what already exists.

## Architecture

### Models

| Component | Model | Cost | Why |
|---|---|---|---|
| Transcription | OpenAI **`gpt-4o-mini-transcribe`** | $0.003/min | Half the cost of full gpt-4o-transcribe, quality is sufficient when boosted by domain prompting (see below) |
| Cleanup | **`deepseek/deepseek-v4-flash`** (existing CHAT_MODEL) | ~$0.0001/call | Already wired into the backend. Filler removal needs almost no reasoning — flash is plenty |

We do not use Anthropic models here. They are 8× more expensive than DeepSeek for equivalent cleanup quality.

### Domain prompting — our quality edge

Both gpt-4o transcribe variants accept a `prompt` parameter. We pass project state on every request:

```
Storyline planning for "<title>". Genre: <genre>.
Characters: <protagonist>, <supporting cast names>.
Setting: <locations>.
```

This dramatically reduces errors on character names, invented terms, and unusual proper nouns — exactly the words that matter most in book planning. Wispr cannot do this; it has no project context.

### API choice — streamed batch

We use `POST /v1/audio/transcriptions` with `stream=true`. This streams the transcript back as `transcript.text.delta` SSE events as the model generates output, even though the audio was uploaded as one batch.

We do **not** use the Realtime API for v1. Realtime is more complex (WebSockets, server-side VAD, audio chunking) and the perceived-latency improvement for our toggle/push-to-talk flow is small. Reserved for Phase 3 if user feedback demands it.

### Backend additions

Two new endpoints in [backend/src/](../../backend/src/):

#### `POST /transcribe`
- Multipart upload: `audio` (webm/opus blob, max 25MB), `licenceKey`, `projectContext` (string for prompt injection)
- Validates licence, debits credits (see "Credits & pricing" below)
- Calls OpenAI `audio.transcriptions.create({ model: 'gpt-4o-mini-transcribe', file, prompt, stream: true })`
- Pipes `transcript.text.delta` events back as SSE
- Returns final `{ transcript, durationMs, audioSeconds }` on `transcript.text.done`

#### `POST /transcribe/polish`
- Body: `{ licenceKey, text }`
- Calls existing chat infrastructure with `deepseek-v4-flash` and a tight system prompt:
  > "Clean this dictated transcript. Remove filler words (um, uh, like, you know). Join false starts into the speaker's intended sentence. Fix obvious capitalisation. Do NOT change meaning, add content, or rephrase. Return only cleaned text — no preamble, no quotes."
- Streams cleaned text back via SSE for smooth replacement
- No additional credit charge — included in the dictation cost (see below)

### Webview additions

Single new hook in [extension/webview/src/planning/](../../extension/webview/src/planning/): `useDictation`.

Owns:
- `MediaRecorder` lifecycle (start, stop, blob assembly)
- Key event handling (push-to-talk, toggle, cancel)
- Recording state (idle, recording, transcribing, polishing)
- Transcript insertion **at cursor position only — never replace existing text**
- Audio level meter for the recording indicator

The InputBox renders the existing UI plus:
- A small mic indicator in the right gutter that pulses while recording
- A border state change (pulsing accent) to mirror Wispr's visual feedback
- A "transcribing…" / "polishing…" sub-label below the textarea while async work runs

### Cursor-position insertion — non-negotiable

The transcribed text is inserted at the textarea's `selectionStart` position. If the user has typed text and then started dictation, their text is preserved and the dictation appears at their cursor. The dictation flow **must never replace existing input**. After insertion, the cursor advances to the end of the inserted block so chained dictations append cleanly.

This is enforced in `useDictation` and tested explicitly. Any future change that violates this is a regression.

## Keyboard shortcuts

Wispr's killer feature is keyboard-driven recording from inside the input field. Three modes, mapped to keys that don't collide with VS Code:

| Action | Shortcut | Behaviour |
|---|---|---|
| **Push-to-talk** | Hold `⌥` (Option/Alt) | Records while held, transcribes on release |
| **Toggle (lock)** | `⌥ + Space` | Tap to start, tap again or `Esc` to stop. Survives key release — for longer dictation while you think |
| **Cancel** | `Esc` while recording | Discards audio, no upload, no charge |

### Why ⌥ and not Ctrl/Fn

- **Ctrl** collides extensively with VS Code (terminal toggle, line nav, IDE shortcuts)
- **Fn** events are not reliably exposed to web/Electron contexts on macOS — Wispr uses a system-level helper which we cannot replicate from a webview
- **⌥** is essentially free in chat contexts on macOS, maps to Alt on Windows/Linux which is similarly free in textareas

### Activation rules

- Shortcuts only fire when the planning textarea has focus (no global capture)
- 150ms hold threshold before push-to-talk engages, so a quick tap doesn't trigger
- During recording, all other keystrokes are still passed through to the textarea — the user can keep typing, and dictation appends at the new cursor position when transcription completes

## Credits & pricing

### Decision: dictation draws from the existing credit pool

No separate STT counter. No new tier. Voice usage burns the same credits as chat — keeps the mental model simple and means voice is included in any plan a writer is already on.

### Burn rate

| Activity | Credit cost |
|---|---|
| 1 minute of audio dictated (gpt-4o-mini-transcribe + DeepSeek polish) | Equivalent to ~1 chat turn |
| Cancelled recording (Esc before stop) | Free — no API call made |

The DeepSeek polish call is so cheap (~$0.0001) that we don't separately meter it. The transcription cost ($0.003/min) is the entire effective burn.

### Daily exposure scenarios

| Usage pattern | Audio cost / month | Polish cost / month | **Total / month** |
|---|---|---|---|
| Light: 10 min/day | $0.90 | $0.01 | **~$0.91** |
| Moderate: 30 min/day | $2.70 | $0.03 | **~$2.73** |
| Heavy: 60 min/day | $5.40 | $0.07 | **~$5.47** |
| Power user: 2 hrs/day | $10.80 | $0.13 | **~$10.93** |

For comparison, the existing chat usage for a moderately active writer is roughly $1/month. So a moderate dictation user roughly **4× the per-user cost** — well within margin for paid plans, and capped naturally by the existing daily credit limit.

### Free tier protection

The existing daily credit ceiling on free accounts naturally caps free dictation. No separate cap needed.

## UX flow

1. Writer is in the planning chat, cursor in the textarea
2. Holds `⌥` (or taps `⌥+Space` to lock)
3. Border pulses accent, mic indicator appears, audio level meter shows live input
4. Speaks for 5–60s
5. Releases `⌥` (or taps `⌥+Space` again)
6. Border returns to normal, "transcribing…" appears below textarea
7. Text streams in at cursor position over ~1s
8. "polishing…" appears briefly
9. Cleaned text replaces the raw transcript inline (still at cursor position)
10. Writer continues typing, dictating again, or hits Enter to send

If `Esc` is pressed at any point during steps 3–8, the recording is discarded with no charge.

## Phased delivery

### Phase 1 — Core dictation (1 day)

- `useDictation` hook with MediaRecorder + key handlers
- `⌥` push-to-talk + `⌥+Space` toggle + `Esc` cancel
- `/transcribe` endpoint, streamed SSE deltas
- Project-state prompt injection on every request
- **Cursor-position insertion only** — never replaces text
- Recording border pulse + mic indicator

**Acceptance:** writer can hold ⌥, speak, release, and accurate text appears at cursor within ~1s. Pre-typed text is preserved.

### Phase 2 — Polish pass (½ day)

- `/transcribe/polish` endpoint
- "Polish dictation" setting (default on)
- Streamed cleanup with visual cue while running
- Skip polish on transcripts under ~10 words (no value)

**Acceptance:** filler words and false starts removed without changing meaning. Toggling polish off skips the cleanup call.

### Phase 3 — Realtime API (deferred, 2–3 days)

Optional, only if real usage shows latency complaints:
- WebSocket through backend to `wss://api.openai.com/v1/realtime?intent=transcription`
- Server-side VAD with auto-stop on silence
- `input_audio_noise_reduction: "near_field"` for laptop mics
- Live partials as the writer speaks (no need to release ⌥)

## Open questions for build time

1. **Audio level meter visual** — simple amplitude bar, or animated waveform? Lean simple bar for v1.
2. **Polish toggle location** — settings panel only, or also a quick toggle in the InputBox? Settings only for v1; promote to inline if requested.
3. **Mini-transcribe quality validation** — A/B test mini vs full gpt-4o-transcribe on a few real planning sessions before locking in mini. Fall back to full if mini is noticeably worse on character names.
4. **Mid-dictation typing** — if the writer types while recording is active, do we pause recording or let both happen in parallel? Default: parallel. Recording continues, typed text goes to cursor position, transcribed text appends after typed text on completion.

## Out of scope for M8

- TTS (reading AI responses aloud) — separate question, not part of this milestone
- Voice commands beyond text input ("Hey Storyline, save this stage") — possible M9+
- Multi-language detection / per-project language preference — defaults to English; configurable later if needed
- Speaker diarisation — irrelevant for solo dictation

## Files that will change

- `backend/src/transcribe.ts` — new endpoint
- `backend/src/transcribe-polish.ts` — new endpoint (or fold into existing chat infrastructure)
- `backend/src/index.ts` — route registration
- `backend/wrangler.toml` — `OPENAI_API_KEY` env var if not already present
- `extension/webview/src/planning/hooks/useDictation.ts` — new
- `extension/webview/src/planning/components/InputBox.tsx` — wire mic indicator + key handlers
- `extension/webview/src/planning/components/MicIndicator.tsx` — new, small visual
- `extension/src/panels/ChatPanel.ts` — pass project context to webview for prompt building
- `extension/package.json` — webview microphone permission claim if needed
