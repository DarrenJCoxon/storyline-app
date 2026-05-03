import { describe, it, expect } from 'vitest'
import {
  LOW_THRESHOLD,
  REARM_THRESHOLD,
  lowCreditWarningDecision,
} from '../credit-display.js'

describe('lowCreditWarningDecision', () => {
  it('fires the first time balance dips into the low band', () => {
    expect(lowCreditWarningDecision(LOW_THRESHOLD, undefined)).toBe('fire')
    expect(lowCreditWarningDecision(LOW_THRESHOLD - 1, undefined)).toBe('fire')
    expect(lowCreditWarningDecision(1, undefined)).toBe('fire')
  })

  it('mutes after warning is already recorded', () => {
    expect(lowCreditWarningDecision(LOW_THRESHOLD, LOW_THRESHOLD)).toBe('mute')
    expect(lowCreditWarningDecision(20, LOW_THRESHOLD)).toBe('mute')
    expect(lowCreditWarningDecision(1, LOW_THRESHOLD)).toBe('mute')
  })

  it('resets the warning flag when balance climbs back above re-arm threshold', () => {
    expect(lowCreditWarningDecision(REARM_THRESHOLD, LOW_THRESHOLD)).toBe('reset')
    expect(lowCreditWarningDecision(REARM_THRESHOLD + 500, LOW_THRESHOLD)).toBe('reset')
  })

  it('no-ops above re-arm when no prior warning was recorded', () => {
    expect(lowCreditWarningDecision(REARM_THRESHOLD, undefined)).toBe('noop')
    expect(lowCreditWarningDecision(500, undefined)).toBe('noop')
  })

  it('no-ops in the dead zone between LOW_THRESHOLD and REARM_THRESHOLD when never warned', () => {
    // 50 < balance < 100 — not low enough to warn, not high enough to reset.
    expect(lowCreditWarningDecision(75, undefined)).toBe('noop')
    expect(lowCreditWarningDecision(LOW_THRESHOLD + 1, undefined)).toBe('noop')
    expect(lowCreditWarningDecision(REARM_THRESHOLD - 1, undefined)).toBe('noop')
  })

  it('no-ops at zero — exhausted-credits modal handles that case', () => {
    expect(lowCreditWarningDecision(0, undefined)).toBe('noop')
    expect(lowCreditWarningDecision(0, LOW_THRESHOLD)).toBe('noop')
    expect(lowCreditWarningDecision(-5, undefined)).toBe('noop') // defensive
  })

  it('does not flap on small spend after warning', () => {
    // Sequence: warned at 45, spend down to 40, then 30.
    // Each subsequent call should mute, not fire.
    let state: number | undefined = undefined
    expect(lowCreditWarningDecision(45, state)).toBe('fire')
    state = LOW_THRESHOLD
    expect(lowCreditWarningDecision(40, state)).toBe('mute')
    expect(lowCreditWarningDecision(30, state)).toBe('mute')
    expect(lowCreditWarningDecision(10, state)).toBe('mute')
  })

  it('full lifecycle: low → top-up → low again → fire again', () => {
    let state: number | undefined = undefined
    // Initial dip
    expect(lowCreditWarningDecision(40, state)).toBe('fire')
    state = LOW_THRESHOLD
    // User tops up
    expect(lowCreditWarningDecision(1040, state)).toBe('reset')
    state = undefined
    // Spends back down
    expect(lowCreditWarningDecision(45, state)).toBe('fire')
  })
})
