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
  const [dictError, setDictError] = useState<string | null>(null)
  const [micDevice, setMicDevice] = useState<string | null>(null)
  const { on, send } = useVSCode()

  const dictStateRef = useRef<DictationState>('idle')
  const altHeldRef = useRef(false)
  const altHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toggleLockedRef = useRef(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { dictStateRef.current = dictState }, [dictState])

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [])

  // Request current device on mount
  useEffect(() => { send({ type: 'getMicDevice' }) }, [send])

  const showError = useCallback((msg: string) => {
    setDictError(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setDictError(null), 6000)
  }, [])

  const startRecording = useCallback(() => {
    if (dictStateRef.current !== 'idle') return
    setDictError(null)
    send({ type: 'startRecording' })
  }, [send])

  const stopAndTranscribe = useCallback(() => {
    if (dictStateRef.current !== 'recording') return
    setDictState('transcribing')
    send({ type: 'stopRecording' })
  }, [send])

  const cancelRecording = useCallback(() => {
    const state = dictStateRef.current
    if (state === 'idle') return
    send({ type: 'cancelRecording' })
    toggleLockedRef.current = false
    altHeldRef.current = false
    if (altHoldTimerRef.current) {
      clearTimeout(altHoldTimerRef.current)
      altHoldTimerRef.current = null
    }
    setDictState('idle')
  }, [send])

  const selectMic = useCallback(() => {
    send({ type: 'selectMic' })
  }, [send])

  // Messages from extension host
  useEffect(() => {
    const offStarted = on<Record<string, never>>('recordingStarted', () => {
      setDictState('recording')
      setDictError(null)
    })

    const offFailed = on<{ message: string }>('recordingFailed', ({ message }) => {
      showError(message)
      setDictState('idle')
      toggleLockedRef.current = false
    })

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

    return () => { offStarted(); offFailed(); offResult(); offError(); offDevice() }
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
        startRecording()
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
          if (altHeldRef.current) startRecording()
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
