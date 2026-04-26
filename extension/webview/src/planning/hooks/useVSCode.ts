import { useEffect, useRef, useCallback } from 'react'

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null

export function useVSCode() {
  const listeners = useRef<Map<string, Array<(msg: unknown) => void>>>(new Map())

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string }
      const fns = listeners.current.get(msg.type) ?? []
      for (const fn of fns) fn(msg)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const on = useCallback(<T>(type: string, fn: (msg: T) => void) => {
    const existing = listeners.current.get(type) ?? []
    listeners.current.set(type, [...existing, fn as (msg: unknown) => void])
    return () => {
      const updated = (listeners.current.get(type) ?? []).filter(f => f !== fn)
      listeners.current.set(type, updated)
    }
  }, [])

  const send = useCallback((msg: Record<string, unknown>) => {
    vscode?.postMessage(msg)
  }, [])

  return { on, send }
}
