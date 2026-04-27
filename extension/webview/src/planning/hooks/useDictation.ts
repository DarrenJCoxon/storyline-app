import { useRef, useState, useCallback, useEffect } from 'react'
import { useVSCode } from './useVSCode.js'

export type DictationState = 'idle' | 'recording' | 'transcribing'

interface UseDictationOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  getValue: () => string
  onInsert: (newValue: string, cursorAfter: number) => void
}

export function useDictation({ textareaRef, getValue, onInsert }: UseDictationOptions) {
  const [dictState, setDictState] = useState<DictationState>('idle')
  const { on, send } = useVSCode()

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const altHeldRef = useRef(false)
  const altHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toggleLockedRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const rec = mediaRecorderRef.current
      if (rec && rec.state !== 'inactive') {
        rec.ondataavailable = null
        rec.onstop = null
        rec.stop()
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (dictState !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(250)
      mediaRecorderRef.current = recorder
      setDictState('recording')
    } catch {
      setDictState('idle')
    }
  }, [dictState])

  const stopAndTranscribe = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    setDictState('transcribing')

    recorder.onstop = async () => {
      const mimeType = recorder.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })

      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      mediaRecorderRef.current = null

      // Convert to base64 in chunks to avoid call stack overflow on large blobs
      const buffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(buffer)
      let binary = ''
      const CHUNK = 8192
      for (let i = 0; i < uint8.length; i += CHUNK) {
        binary += String.fromCharCode(...Array.from(uint8.slice(i, i + CHUNK)))
      }
      const audioBase64 = btoa(binary)

      send({ type: 'transcribe', audioBase64, mimeType })
    }

    recorder.stop()
  }, [send])

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    mediaRecorderRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    chunksRef.current = []
    toggleLockedRef.current = false
    altHeldRef.current = false
    if (altHoldTimerRef.current) {
      clearTimeout(altHoldTimerRef.current)
      altHoldTimerRef.current = null
    }
    setDictState('idle')
  }, [])

  // Receive transcript from extension host and insert at cursor
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

    const offError = on<{ message: string }>('transcribeError', () => {
      setDictState('idle')
      toggleLockedRef.current = false
    })

    return () => { offResult(); offError() }
  }, [on, textareaRef, getValue, onInsert])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌥Space → toggle lock on/off
    if (e.altKey && e.code === 'Space') {
      e.preventDefault()
      if (toggleLockedRef.current || dictState === 'recording') {
        toggleLockedRef.current = false
        if (dictState === 'recording') stopAndTranscribe()
      } else if (dictState === 'idle') {
        toggleLockedRef.current = true
        startRecording()
      }
      return
    }

    // Esc → cancel
    if (e.key === 'Escape' && (dictState === 'recording' || dictState === 'transcribing')) {
      e.preventDefault()
      cancelRecording()
      return
    }

    // ⌥ hold → push-to-talk (150ms threshold)
    if (e.key === 'Alt' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (toggleLockedRef.current) return
      if (!altHeldRef.current) {
        altHeldRef.current = true
        altHoldTimerRef.current = setTimeout(() => {
          if (altHeldRef.current) startRecording()
        }, 150)
      }
    }
  }, [dictState, startRecording, stopAndTranscribe, cancelRecording])

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Alt') {
      altHeldRef.current = false
      if (altHoldTimerRef.current) {
        clearTimeout(altHoldTimerRef.current)
        altHoldTimerRef.current = null
      }
      // Release ⌥ in push-to-talk mode → stop recording
      if (!toggleLockedRef.current && dictState === 'recording') {
        stopAndTranscribe()
      }
    }
  }, [dictState, stopAndTranscribe])

  return { dictState, handleKeyDown, handleKeyUp, cancelRecording }
}
