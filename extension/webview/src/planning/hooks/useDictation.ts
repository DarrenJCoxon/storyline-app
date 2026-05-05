import { useRef, useState, useCallback, useEffect } from 'react'
import { useVSCode } from './useVSCode.js'

export type DictationState = 'idle' | 'recording' | 'transcribing'

interface UseDictationOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  getValue: () => string
  onInsert: (newValue: string, cursorAfter: number) => void
}

// Pick a MediaRecorder mime type the browser actually supports. Whisper
// accepts webm/opus, mp4/m4a, ogg, wav directly — webm/opus is universally
// available in Chromium-based webviews and produces the smallest payload.
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
      // strip the "data:audio/webm;base64," prefix
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}

export function useDictation({ textareaRef, getValue, onInsert }: UseDictationOptions) {
  const [dictState, setDictState] = useState<DictationState>('idle')
  const [dictError, setDictError] = useState<string | null>(null)
  const [micDevice, setMicDevice] = useState<string | null>(null)
  const { on, send } = useVSCode()

  const dictStateRef = useRef<DictationState>('idle')
  const altHeldRef = useRef(false)
  const altHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toggleLockedRef = useRef(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Browser-side recording state
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const cancelledRef = useRef(false)
  const mimeTypeRef = useRef<string>('audio/webm')

  useEffect(() => { dictStateRef.current = dictState }, [dictState])

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      // Defensive cleanup if the component unmounts mid-recording.
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch { /* ignore */ }
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const showError = useCallback((msg: string) => {
    setDictError(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setDictError(null), 6000)
  }, [])

  const teardownStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const startRecording = useCallback(async () => {
    if (dictStateRef.current !== 'idle') return
    setDictError(null)

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      showError('Microphone API not available in this VS Code build.')
      toggleLockedRef.current = false
      return
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          // Browser-level enhancements — better STT accuracy than raw mic.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(micDevice ? { deviceId: { exact: micDevice } } : {}),
        },
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
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
          setDictState('idle')
          toggleLockedRef.current = false
          return
        }

        if (chunks.length === 0) {
          showError('No audio captured — try holding longer.')
          setDictState('idle')
          toggleLockedRef.current = false
          return
        }

        try {
          const blob = new Blob(chunks, { type: mt })
          const audioBase64 = await blobToBase64(blob)
          send({ type: 'transcribeAudio', audioBase64, mimeType: mt })
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err))
          setDictState('idle')
          toggleLockedRef.current = false
        }
      }

      recorder.start()
      setDictState('recording')
    } catch (err) {
      teardownStream()
      const name = err instanceof Error ? err.name : ''
      const msg  = err instanceof Error ? err.message : String(err)
      // NotAllowedError: user (or OS) denied mic access. Ask the extension
      // host to show a toast with an "Open Settings" button that deep-links
      // straight to the OS pane — much clearer than asking the user to find
      // it themselves.
      if (name === 'NotAllowedError' || /Permission denied/i.test(msg)) {
        send({ type: 'micPermissionDenied' })
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        showError('No microphone found. Plug one in and try again.')
      } else {
        showError(`Recorder error: ${msg}`)
      }
      setDictState('idle')
      toggleLockedRef.current = false
    }
  }, [micDevice, send, showError, teardownStream])

  const stopAndTranscribe = useCallback(() => {
    if (dictStateRef.current !== 'recording') return
    cancelledRef.current = false
    setDictState('transcribing')
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      try { r.stop() } catch { /* recorder.onstop will fire */ }
    } else {
      teardownStream()
      setDictState('idle')
    }
  }, [teardownStream])

  const cancelRecording = useCallback(() => {
    const state = dictStateRef.current
    if (state === 'idle') return
    cancelledRef.current = true
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      try { r.stop() } catch { /* ignore */ }
    } else {
      teardownStream()
    }
    toggleLockedRef.current = false
    altHeldRef.current = false
    if (altHoldTimerRef.current) {
      clearTimeout(altHoldTimerRef.current)
      altHoldTimerRef.current = null
    }
    setDictState('idle')
  }, [teardownStream])

  const selectMic = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      showError('Device enumeration not available.')
      return
    }
    // Trigger a permission prompt first if needed; otherwise enumerateDevices
    // returns empty labels.
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tempStream.getTracks().forEach(t => t.stop())
    } catch { /* user may have denied — enumerateDevices will still return ids */ }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter(d => d.kind === 'audioinput')
    if (audioInputs.length === 0) {
      showError('No microphones found.')
      return
    }
    // Send the list to the extension host, which presents a QuickPick and
    // tells us which deviceId was chosen via the existing micDeviceChanged
    // event. (We could implement a webview-side picker but the extension
    // host gives us a native VS Code picker for free.)
    send({
      type: 'pickMicFromList',
      devices: audioInputs.map(d => ({ deviceId: d.deviceId, label: d.label || 'Unnamed device' })),
    })
  }, [send, showError])

  // Messages from extension host
  useEffect(() => {
    const offResult = on<{ text: string }>('transcribeResult', ({ text }) => {
      const el = textareaRef.current
      const cursorPos = el?.selectionStart ?? getValue().length
      const current = getValue()

      const before = current.slice(0, cursorPos)
      const after = current.slice(cursorPos)
      const separator = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
      const inserted = separator + text.trim()

      onInsert(before + inserted + after, cursorPos + inserted.length)
      setDictState('idle')
      toggleLockedRef.current = false
    })

    const offError = on<{ message: string }>('transcribeError', ({ message }) => {
      showError(message)
      setDictState('idle')
      toggleLockedRef.current = false
    })

    const offDevice = on<{ device: string | null }>('micDeviceChanged', ({ device }) => {
      setMicDevice(device)
    })

    return () => { offResult(); offError(); offDevice() }
  }, [on, textareaRef, getValue, onInsert, showError])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const state = dictStateRef.current

    if (e.altKey && e.code === 'Space') {
      e.preventDefault()
      if (toggleLockedRef.current || state === 'recording') {
        toggleLockedRef.current = false
        if (state === 'recording') stopAndTranscribe()
      } else if (state === 'idle') {
        toggleLockedRef.current = true
        void startRecording()
      }
      return
    }

    if (e.key === 'Escape' && (state === 'recording' || state === 'transcribing')) {
      e.preventDefault()
      cancelRecording()
      return
    }

    if (e.key === 'Alt' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (toggleLockedRef.current) return
      if (!altHeldRef.current) {
        altHeldRef.current = true
        altHoldTimerRef.current = setTimeout(() => {
          if (altHeldRef.current) void startRecording()
        }, 150)
      }
    }
  }, [startRecording, stopAndTranscribe, cancelRecording])

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Alt') {
      altHeldRef.current = false
      if (altHoldTimerRef.current) {
        clearTimeout(altHoldTimerRef.current)
        altHoldTimerRef.current = null
      }
      if (!toggleLockedRef.current && dictStateRef.current === 'recording') {
        stopAndTranscribe()
      }
    }
  }, [stopAndTranscribe])

  return { dictState, dictError, micDevice, handleKeyDown, handleKeyUp, cancelRecording, startRecording, selectMic }
}
