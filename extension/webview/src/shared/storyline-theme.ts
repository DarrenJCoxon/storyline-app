// Shared synchronous theme bootstrap for every Storyline webview.
//
// Why synchronous: VS Code adds `vscode-light` / `vscode-dark` /
// `vscode-high-contrast[-light]` classes to <body> before any user script
// runs. If we wait for React to mount before applying our `.light` class,
// users in light editors see a flash of dark Storyline tokens on every
// panel open. Calling `bootstrapStorylineTheme()` synchronously from each
// entry point (planning/main.tsx, compile/main.tsx, ...) at the top —
// before `createRoot().render()` — sets the class on <html> in the same
// frame as the initial paint.
//
// Why MutationObserver: VS Code lets users switch theme live, and a few
// VS Code builds add the body class slightly after DOMContentLoaded.

export type StorylineThemeKind = 'dark' | 'light'

export function detectVSCodeKind(): StorylineThemeKind {
  if (typeof document === 'undefined') return 'dark'
  const b = document.body
  if (b.classList.contains('vscode-light')) return 'light'
  if (b.classList.contains('vscode-high-contrast-light')) return 'light'
  if (b.classList.contains('vscode-dark') || b.classList.contains('vscode-high-contrast')) return 'dark'
  const kind = b.getAttribute('data-vscode-theme-kind')
  if (kind === 'vscode-light' || kind === 'vscode-high-contrast-light') return 'light'
  if (kind === 'vscode-dark' || kind === 'vscode-high-contrast') return 'dark'
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

let observer: MutationObserver | null = null

export function bootstrapStorylineTheme(): void {
  const apply = () => {
    const kind = detectVSCodeKind()
    document.documentElement.classList.toggle('light', kind === 'light')
  }

  apply()

  // Observer survives for the lifetime of the webview — no need to
  // disconnect since the webview's whole document is torn down on close.
  if (observer) return
  observer = new MutationObserver(apply)
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-vscode-theme-kind'],
  })
}
