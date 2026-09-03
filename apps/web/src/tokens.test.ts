import { describe, expect, it } from 'vitest'

import { TISSUE_RAMP, TOKEN_NAMES, confidenceToken, severityToken } from './tokens'

describe('the tissue ramp', () => {
  it('runs healthy to dead, in that order', () => {
    // The order IS the scale: SeverityScale fills left to right from it.
    expect(TISSUE_RAMP).toEqual(['chlorophyll', 'chlorosis', 'necrosis', 'sporulation'])
  })

  it('only contains declared tokens', () => {
    for (const name of TISSUE_RAMP) expect(TOKEN_NAMES).toContain(name)
  })
})

describe('severityToken', () => {
  it('maps the severities used in disease_info.json', () => {
    expect(severityToken('low')).toBe('chlorosis')
    expect(severityToken('moderate')).toBe('necrosis')
    expect(severityToken('high')).toBe('necrosis')
  })

  it('is case insensitive', () => {
    expect(severityToken('High')).toBe(severityToken('high'))
  })

  it('falls back to a neutral for an unknown or missing severity', () => {
    expect(severityToken(null)).toBe('ink-soft')
    expect(severityToken(undefined)).toBe('ink-soft')
    expect(severityToken('catastrophic')).toBe('ink-soft')
  })
})

describe('confidenceToken', () => {
  it('never returns a red for low confidence', () => {
    // Uncertainty is calm, not alarming. Red means necrotic tissue in this
    // palette, not "error" (docs/design_plan.md section 5).
    expect(confidenceToken(0.2)).toBe('ink-soft')
    expect(confidenceToken(0.59)).toBe('ink-soft')
  })

  it('steps up through the ramp as confidence rises', () => {
    expect(confidenceToken(0.6)).toBe('chlorosis')
    expect(confidenceToken(0.84)).toBe('chlorosis')
    expect(confidenceToken(0.85)).toBe('chlorophyll')
    expect(confidenceToken(1)).toBe('chlorophyll')
  })
})
