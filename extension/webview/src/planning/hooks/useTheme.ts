import { useState, useEffect, useCallback } from 'react'
import { detectVSCodeKind } from '../../shared/storyline-theme.js'

export type ThemeMode = 'dark' | 'light' | 'auto'

export function useTheme(send: (msg: Record<string, unknown>) => void, initial: ThemeMode = 'auto') {
  const [mode, setMode] = useState<ThemeMode>(initial)

  const applyTheme = useCallback((m: ThemeMode) => {
    const root = document.documentElement
    root.classList.add('theme-transition')

    if (m === 'auto') {
      root.classList.toggle('light', detectVSCodeKind() === 'light')
    } else {
      root.classList.toggle('light', m === 'light')
    }

    setTimeout(() => root.classList.remove('theme-transition'), 200)
  }, [])

  // Auto mode: re-apply when VS Code's body class changes (live theme
  // switch, or class landing slightly after DOMContentLoaded — the
  // latter being the source of the dark-editor / light-chat-panel
  // mismatch users used to see on first launch).
  useEffect(() => {
    if (mode !== 'auto') return
    const reapply = () => applyTheme('auto')

    const observer = new MutationObserver(reapply)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-vscode-theme-kind'],
    })

    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', reapply)

    reapply()

    return () => {
      observer.disconnect()
      mq.removeEventListener('change', reapply)
    }
  }, [mode, applyTheme])

  useEffect(() => { applyTheme(mode) }, [mode, applyTheme])

  const setAndPersist = useCallback((m: ThemeMode) => {
    setMode(m)
    send({ type: 'setTheme', theme: m })
  }, [send])

  return { mode, setMode: setAndPersist }
}
