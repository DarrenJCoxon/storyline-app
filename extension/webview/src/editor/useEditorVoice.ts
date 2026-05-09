// CB-12 — voice dictation hook for the chapter editor.
//
// Mirrors the planning chat's useDictation but adapted for TipTap:
// instead of inserting into a textarea, the transcribed text gets
// inserted at the editor's current selection via `editor.commands
// .insertContent`.
//
// Same MediaRecorder pattern as the planning chat (CB-12 reuses the
// per-CB-14 webview recording infra). Browser-level echo cancellation,
// noise suppression, and AGC are all enabled — better STT accuracy
// than raw mic capture.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

export type VoiceState = 'idle' | 'recording' | 'transcribing'

interface UseEditorVoiceOptions {
  editor: Editor | null
  /** Called when a permission-denied error fires — the panel host
   *  shows a native VS Code toast with a deep-link to OS settings. */
  onPermissionDenied: () => void
  /** Generic recoverable error path — the editor surfaces it as a
   *  small inline message; non-fatal. */
  onError: (msg: string) => void
  /** Send a message to the extension host (typically `vscode.postMessage`). */
  postMessage: (msg: Record<string, unknown>) => void
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return 'audio/webm'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') return reject(new Error('FileReader: unexpected result'))
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}

export function useEditorVoice({ editor, onPermissionDenied, onError, postMessage }: UseEditorVoiceOptions) {
  const [state, setState] = useState<VoiceState>('idle')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const chunksRef   = useRef<BlobPart[]>([])
  const cancelledRef = useRef(false)
  const mimeTypeRef = useRef<string>('audio/webm')

  // Keep state ref in sync so the global key handlers (added below) can
  // see current state without re-binding on every render.
  const stateRef = useRef<VoiceState>('idle')
  useEffect(() => { stateRef.current = state }, [state])

  const teardownStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const startRecording = useCallback(async () => {
    if (stateRef.current !== 'idle') return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError('Microphone API not available in this VS Code build.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      const mimeType = pickMimeType()
      mimeTypeRef.current = mimeType
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []
      cancelledRef.current = false

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const wasCancelled = cancelledRef.current
        const chunks = chunksRef.current
        const mt = mimeTypeRef.current
        teardownStream()

        if (wasCancelled) {
          setState('idle')
          return
        }
        if (chunks.length === 0) {
          onError('No audio captured — try holding longer.')
          setState('idle')
          return
        }
        try {
          const blob = new Blob(chunks, { type: mt })
          const audioBase64 = await blobToBase64(blob)
          postMessage({ type: 'transcribeAudio', audioBase64, mimeType: mt })
          // setState('transcribing') already happens before stop(); leave it.
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err))
          setState('idle')
        }
      }

      recorder.start()
      setState('recording')
    } catch (err) {
      teardownStream()
      const name = err instanceof Error ? err.name : ''
      const msg  = err instanceof Error ? err.message : String(err)
      if (name === 'NotAllowedError' || /Permission denied/i.test(msg)) {
        onPermissionDenied()
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        onError('No microphone found. Plug one in and try again.')
      } else {
        onError(`Recorder error: ${msg}`)
      }
      setState('idle')
    }
  }, [onError, onPermissionDenied, postMessage, teardownStream])

  const stopAndTranscribe = useCallback(() => {
    if (stateRef.current !== 'recording') return
    cancelledRef.current = false
    setState('transcribing')
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      try { r.stop() } catch { /* recorder.onstop fires */ }
    } else {
      teardownStream()
      setState('idle')
    }
  }, [teardownStream])

  const cancelRecording = useCallback(() => {
    if (stateRef.current === 'idle') return
    cancelledRef.current = true
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      try { r.stop() } catch { /* ignore */ }
    } else {
      teardownStream()
    }
    setState('idle')
  }, [teardownStream])

  // Listen for transcribe results from the extension host. Insert at the
  // editor's current selection. Uses tiptap's chain so the cursor lands
  // right after the inserted text.
  useEffect(() => {
    function handler(event: MessageEvent) {
      const msg = event.data as { type?: string; text?: string; message?: string }
      if (!msg || typeof msg.type !== 'string') return

      if (msg.type === 'transcribeResult' && typeof msg.text === 'string') {
        if (editor && msg.text.trim()) {
          // Add a leading space if the cursor isn't already at a space
          // boundary, so dictation flows into surrounding prose without
          // joining-up against the previous word.
          const sel = editor.state.selection
          const before = editor.state.doc.textBetween(Math.max(0, sel.from - 1), sel.from, ' ')
          const needsSpace = before && !/\s/.test(before)
          editor.chain().focus().insertContent((needsSpace ? ' ' : '') + msg.text.trim()).run()
        }
        setState('idle')
        return
      }
      if (msg.type === 'transcribeError') {
        onError(msg.message ?? 'Transcription failed.')
        setState('idle')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [editor, onError])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch { /* ignore */ }
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return { state, startRecording, stopAndTranscribe, cancelRecording }
}
