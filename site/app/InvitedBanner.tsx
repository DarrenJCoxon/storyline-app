'use client'

import { useEffect, useState } from 'react'

/**
 * Soft "You were invited" banner. Shows above the download CTA when
 * either:
 *   1. URL has `?ref=<code>` (just bounced through `/r/<code>`), or
 *   2. localStorage holds a previously-stored ref code.
 *
 * Stores the code in localStorage on first sight so users who poke
 * around the site before installing still get the bonus when they
 * eventually fire the activation URI.
 */
export default function InvitedBanner() {
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    let resolved: string | null = null

    // 1. Query param wins (fresh hop from `/r/<code>`).
    try {
      const params = new URLSearchParams(window.location.search)
      const fromUrl = params.get('ref')
      if (fromUrl && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(fromUrl.toUpperCase())) {
        resolved = fromUrl.toUpperCase()
      }
    } catch { /* ignore */ }

    // 2. Fall back to a previously-stored code.
    if (!resolved) {
      try {
        const raw = localStorage.getItem('storyline-ref-code')
        if (raw) {
          const parsed = JSON.parse(raw) as { code?: string }
          if (parsed.code && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(parsed.code)) {
            resolved = parsed.code
          }
        }
      } catch { /* ignore */ }
    }

    // 3. If we found one via URL but localStorage is empty, persist for
    //    the post-install activation handoff.
    if (resolved) {
      try {
        const existing = localStorage.getItem('storyline-ref-code')
        if (!existing) {
          localStorage.setItem(
            'storyline-ref-code',
            JSON.stringify({ code: resolved, savedAt: Date.now() }),
          )
        }
      } catch { /* ignore */ }
      setCode(resolved)
    }
  }, [])

  if (!code) return null

  // Already-installed users can claim straight away via the URI handler;
  // brand-new visitors install first, then return and click. Either path
  // ends up at the same vscode://...activate?ref=<code> link, which the
  // extension's URI handler resolves into a /free-plan/issue?ref=<code>.
  const claimUri = `vscode://darrenjcoxon.storyline-extension/activate?ref=${code}`

  return (
    <div role="status" style={{
      maxWidth: 540,
      margin: '0 auto 14px',
      padding: '12px 16px',
      background: 'rgba(196, 123, 0, 0.10)',
      border: '1px solid rgba(196, 123, 0, 0.40)',
      borderRadius: 10,
      color: '#e8c270',
      fontSize: 13,
      lineHeight: 1.5,
      textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div>
        You were invited! Claim <strong>50 bonus credits</strong> on top of your free plan.
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
        Already installed?{' '}
        <a
          href={claimUri}
          style={{ color: '#e8c270', textDecoration: 'underline', fontWeight: 500 }}
        >
          Click here to claim your bonus
        </a>
      </div>
    </div>
  )
}
