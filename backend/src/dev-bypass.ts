import type { Env, LicenceRecord } from './types.js'

export const DEV_LICENCE_KEY = 'SL-DEV-LOCAL-TEST-KEY'

/**
 * Returns a synthetic LicenceRecord for the dev bypass key when running in
 * DEV_MODE or on localhost/127.0.0.1. This lets local developers test
 * /chat, /critique, /illustrate, and /transcribe without seeding a real key
 * into ephemeral local KV.
 *
 * Production (DEV_MODE absent, hostname is NOT localhost/127.0.0.1) always
 * returns null — the dev key is treated like any other unknown key.
 */
export function getDevLicenceRecord(key: string, reqUrl: string, env: Env): LicenceRecord | null {
  const url = new URL(reqUrl)
  const isLocal = env.DEV_MODE === 'true' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (!isLocal) return null
  if (key === DEV_LICENCE_KEY) {
    return {
      valid: true,
      type: 'credits',
      creditBalance: 999_999,
      totalPurchased: 999_999,
      stripeCustomerId: 'dev-local',
    }
  }
  return null
}
