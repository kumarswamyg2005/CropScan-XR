import { describe, expect, it } from 'vitest'

import { optimalDials, runCycle, suggestBreak, unmetRequirements } from './cycleMachine'

/** A three-stage stand-in for apple scab: ungated, wetness-gated, ungated. */
function makeCycle() {
  return {
    pathogen: { name: 'Venturia inaequalis', type: 'fungus' },
    cycle_type: 'polycyclic',
    stages: [
      {
        id: 'survival', label: 'Overwintering',
        requires: { temp_c: [0, 20], leaf_wetness_hr: null, rh_pct: null },
      },
      {
        id: 'prepenetration', label: 'Germination',
        requires: { temp_c: [6, 26], leaf_wetness_hr: [9, 48], rh_pct: [90, 100] },
      },
      {
        id: 'colonization', label: 'Lesions',
        requires: { temp_c: [6, 26], leaf_wetness_hr: null, rh_pct: null },
      },
    ],
    environment: {
      temp_c: { min: 6, optimal: 17, max: 26 },
      leaf_wetness_hr: { min: 9, optimal: 18 },
      rh_pct: { min: 80, optimal: 95 },
    },
    interventions: [
      { stage_id: 'prepenetration', action: 'Protectant fungicide before the wetting event', effect: 'blocks', kind: 'chemical' },
      { stage_id: 'survival', action: 'Rake and destroy fallen leaves', effect: 'reduces_inoculum', kind: 'cultural' },
    ],
  }
}

const FAVOURABLE = { temp_c: 17, leaf_wetness_hr: 18, rh_pct: 95 }

describe('unmetRequirements', () => {
  it('passes inside the band', () => {
    expect(unmetRequirements(makeCycle().stages[1].requires, FAVOURABLE)).toEqual([])
  })

  it('names the condition that is too low, in plain language', () => {
    const reasons = unmetRequirements(makeCycle().stages[1].requires, { ...FAVOURABLE, leaf_wetness_hr: 3 })
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('leaf wetness')
    expect(reasons[0]).toContain('below')
    expect(reasons[0]).toContain('9')
  })

  it('names the condition that is too high', () => {
    const reasons = unmetRequirements(makeCycle().stages[1].requires, { ...FAVOURABLE, temp_c: 40 })
    expect(reasons.some((r) => r.includes('above'))).toBe(true)
  })

  it('reports every failing condition, not just the first', () => {
    const reasons = unmetRequirements(makeCycle().stages[1].requires, { temp_c: 40, leaf_wetness_hr: 0, rh_pct: 10 })
    expect(reasons).toHaveLength(3)
  })

  it('treats a null bound as unconstrained', () => {
    expect(unmetRequirements(
      { temp_c: null, leaf_wetness_hr: null, rh_pct: null },
      { temp_c: -50, leaf_wetness_hr: 0, rh_pct: 0 },
    )).toEqual([])
  })
})

describe('runCycle', () => {
  it('completes under favourable conditions', () => {
    const result = runCycle(makeCycle(), FAVOURABLE)
    expect(result.completed).toBe(true)
    expect(result.haltedAt).toBeNull()
    expect(result.stages.every((s) => s.outcome === 'passed')).toBe(true)
  })

  it('halts visibly at the stage whose condition is unmet', () => {
    const result = runCycle(makeCycle(), { ...FAVOURABLE, leaf_wetness_hr: 2 })
    expect(result.completed).toBe(false)
    expect(result.haltedAt).toBe(1)
    expect(result.stages[1].outcome).toBe('failed')
    expect(result.stages[1].reasons[0]).toContain('leaf wetness')
  })

  it('marks later stages not reached rather than failed', () => {
    const result = runCycle(makeCycle(), { ...FAVOURABLE, leaf_wetness_hr: 2 })
    expect(result.stages[2].outcome).toBe('not_reached')
  })

  it('breaks the environment leg of the triangle when it halts', () => {
    expect(runCycle(makeCycle(), FAVOURABLE).triangle)
      .toEqual({ host: true, pathogen: true, environment: true })

    const broken = runCycle(makeCycle(), { ...FAVOURABLE, rh_pct: 20 })
    expect(broken.triangle.environment).toBe(false)
    // Host and pathogen stay lit: a positive diagnosis means both are present.
    expect(broken.triangle.host).toBe(true)
    expect(broken.triangle.pathogen).toBe(true)
  })

  it('gives a plain-language summary naming the stage', () => {
    const result = runCycle(makeCycle(), { ...FAVOURABLE, leaf_wetness_hr: 0 })
    expect(result.summary).toContain('Germination')
    expect(result.summary).toContain('leaf wetness')
  })

  it('halts at the FIRST failing stage', () => {
    expect(runCycle(makeCycle(), { temp_c: 40, leaf_wetness_hr: 0, rh_pct: 0 }).haltedAt).toBe(0)
  })
})

describe('interventions', () => {
  const blocking = makeCycle().interventions[0]
  const partial = makeCycle().interventions[1]

  it('a blocking intervention stops the cycle at its stage', () => {
    const result = runCycle(makeCycle(), FAVOURABLE, [blocking])
    expect(result.completed).toBe(false)
    expect(result.stages[1].outcome).toBe('blocked')
  })

  it('a partial control does NOT stop the cycle', () => {
    // Raking leaves reduces inoculum; it does not eradicate scab. Saying
    // otherwise would be wrong advice with a satisfying animation attached.
    expect(runCycle(makeCycle(), FAVOURABLE, [partial]).completed).toBe(true)
  })

  it('an unfavourable environment halts before a later blocking intervention', () => {
    expect(runCycle(makeCycle(), { ...FAVOURABLE, temp_c: 30 }, [blocking]).haltedAt).toBe(0)
  })
})

describe('dials and hints', () => {
  it('starts the dials in the pathogen optimum, so the cycle runs first', () => {
    const cycle = makeCycle()
    expect(runCycle(cycle, optimalDials(cycle)).completed).toBe(true)
  })

  it('suggests a single condition that would break the cycle', () => {
    const cycle = makeCycle()
    const hint = suggestBreak(cycle, optimalDials(cycle))
    expect(hint).toBeTruthy()
    expect(hint).toMatch(/leaf wetness|humidity|temperature/)
  })

  it('the suggested change actually breaks it', () => {
    const cycle = makeCycle()
    const dials = optimalDials(cycle)
    expect(runCycle(cycle, dials).completed).toBe(true)
    expect(runCycle(cycle, { ...dials, leaf_wetness_hr: 8 }).completed).toBe(false)
  })

  it('offers no hint when the cycle is already halted', () => {
    expect(suggestBreak(makeCycle(), { temp_c: 17, leaf_wetness_hr: 0, rh_pct: 95 })).toBeNull()
  })
})
