import { useState, useEffect, useCallback } from 'react'

export type ThemeMode = 'dark' | 'light' | 'auto'

export function useTheme(send: (msg: Record<string, unknown>) => void, initial: ThemeMode = 'auto') {
  const [mode, setMode] = useState<ThemeMode>(initial)

  const applyTheme = useCallback((m: ThemeMode) => {
    const root = document.documentElement
    root.classList.add('theme-transition')

    if (m === 'auto') {
      root.classList.toggle('light', window.matchMedia('(prefers-color-scheme: light)').matches)
    } else {
      root.classList.toggle('light', m === 'light')
    }

    setTimeout(() => root.classList.remove('theme-transition'), 200)
  }, [])

  // Listen to system preference in auto mode
  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => applyTheme('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, applyTheme])

  useEffect(() => { applyTheme(mode) }, [mode, applyTheme])

  const setAndPersist = useCallback((m: ThemeMode) => {
    setMode(m)
    send({ type: 'setTheme', theme: m })
  }, [send])

  return { mode, setMode: setAndPersist }
}
