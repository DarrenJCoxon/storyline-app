'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

/**
 * Referral landing page — `storyline.my/r/<code>`.
 *
 * Stores the referral code in localStorage so the home page can show a
 * "you were invited!" banner, and so the post-install activation flow
 * can carry the code through into /free-plan/issue?ref=<code>.
 *
 * Then redirects to `/?ref=<code>` so the URL semantics stay clean
 * (someone landing on `/r/ABCDEF` immediately ends up on the home page
 * with the ref still observable as a query param for analytics).
 *
 * Code shape: 8 chars, Crockford base32 (no I, L, O, U). Anything else
 * we treat as a typo and redirect to home without storing — better
 * than persisting a malformed code that will silently fail backend
 * validation later.
 */
export default function ReferralLandingPage() {
  const router = useRouter()
  const params = useParams<{ code: string }>()

  useEffect(() => {
    const raw = (params.code ?? '').trim().toUpperCase()
    const isValid = /^[0-9A-HJKMNP-TV-Z]{8}$/.test(raw)

    if (isValid) {
      try {
        // 90-day TTL is well past typical user adoption window without
        // hoarding stale codes indefinitely.
        const payload = JSON.stringify({ code: raw, savedAt: Date.now() })
        localStorage.setItem('storyline-ref-code', payload)
      } catch {
        /* localStorage unavailable (Safari private mode, etc.) — proceed without */
      }
      router.replace(`/?ref=${raw}`)
    } else {
      router.replace('/')
    }
  }, [params, router])

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#888',
      fontSize: 14,
    }}>
      Redirecting to Storyline…
    </main>
  )
}
