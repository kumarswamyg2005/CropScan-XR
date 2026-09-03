/**
 * The stage machine behind the Infection Theatre.
 *
 * This is the disease triangle expressed as code: susceptible host × virulent
 * pathogen × favourable environment. Remove a leg and the cycle stalls. When
 * the user drops leaf wetness below the pathogen's threshold, the stage must
 * visibly FAIL and the run must halt — that failure is the pedagogy, not an
 * error state.
 *
 * Deliberately pure: no three.js, no React, no clock. Everything it decides is
 * derived from data/disease_cycle.json plus three dial values, so it can be
 * tested exhaustively and so no visual claim in the scene can drift from the
 * knowledge base.
 */

import type { CycleRequires, DiseaseCycle, Intervention } from '../lib/api'

export interface Dials {
  temp_c: number
  leaf_wetness_hr: number
  rh_pct: number
}

export type StageOutcome = 'passed' | 'failed' | 'blocked' | 'not_reached'

export interface StageResult {
  id: string
  label: string
  outcome: StageOutcome
  /** Plain-language lines shown on the halt panel. Empty when the stage passed. */
  reasons: string[]
  /** The intervention that stopped it, when outcome is 'blocked'. */
  blockedBy?: Intervention
}

export interface RunResult {
  stages: StageResult[]
  /** Index of the stage that stopped the run, or null if the cycle completed. */
  haltedAt: number | null
  completed: boolean
  /** Disease-triangle legs, for the persistent HUD glyph. */
  triangle: { host: boolean; pathogen: boolean; environment: boolean }
  summary: string
}

const UNIT = { temp_c: ' °C', leaf_wetness_hr: ' h', rh_pct: '%' } as const
const LABEL = {
  temp_c: 'temperature',
  leaf_wetness_hr: 'leaf wetness',
  rh_pct: 'humidity',
} as const

/**
 * Which requirements this stage fails at these dial settings.
 *
 * Mirrors Requires.unmet() in services/api/app/cycle.py. Both read the same
 * JSON; keeping the wording identical means the headset and the web page say
 * the same sentence about the same failure.
 */
export function unmetRequirements(requires: CycleRequires, dials: Dials): string[] {
  const failures: string[] = []

  for (const key of ['temp_c', 'leaf_wetness_hr', 'rh_pct'] as const) {
    const bounds = requires[key]
    if (!bounds) continue
    const value = dials[key]
    const [lo, hi] = bounds
    if (value < lo) {
      failures.push(
        `${LABEL[key]} is ${value}${UNIT[key]}, below the ${lo}${UNIT[key]} this stage needs`,
      )
    } else if (value > hi) {
      failures.push(
        `${LABEL[key]} is ${value}${UNIT[key]}, above the ${hi}${UNIT[key]} this stage tolerates`,
      )
    }
  }
  return failures
}

/** Dial ranges for the sliders, widened past the pathogen's band so the user
 *  can actually leave the favourable zone — a slider that cannot fail the
 *  cycle teaches nothing. */
export function dialRanges(cycle: DiseaseCycle) {
  const env = cycle.environment
  return {
    temp_c: { min: 0, max: 45, step: 1, initial: Math.round(env.temp_c?.optimal ?? 20) },
    leaf_wetness_hr: {
      min: 0,
      max: 48,
      step: 1,
      initial: Math.round(env.leaf_wetness_hr?.optimal ?? 12),
    },
    rh_pct: { min: 0, max: 100, step: 1, initial: Math.round(env.rh_pct?.optimal ?? 90) },
  }
}

export function optimalDials(cycle: DiseaseCycle): Dials {
  const r = dialRanges(cycle)
  return {
    temp_c: r.temp_c.initial,
    leaf_wetness_hr: r.leaf_wetness_hr.initial,
    rh_pct: r.rh_pct.initial,
  }
}

/**
 * Run the cycle.
 *
 * @param appliedInterventions actions the user has performed at the Treatment
 *        Bench or ticked in the panel. An intervention whose effect is 'blocks'
 *        stops the cycle at its stage outright; 'reduces_inoculum' and 'slows'
 *        do not halt it — they are honest about being partial controls, which
 *        matters, because telling someone that raking leaves eradicates scab
 *        would be wrong.
 */
export function runCycle(
  cycle: DiseaseCycle,
  dials: Dials,
  appliedInterventions: Intervention[] = [],
): RunResult {
  const blocking = new Map<string, Intervention>()
  for (const iv of appliedInterventions) {
    if (iv.effect === 'blocks') blocking.set(iv.stage_id, iv)
  }

  const stages: StageResult[] = []
  let haltedAt: number | null = null

  cycle.stages.forEach((stage, index) => {
    if (haltedAt !== null) {
      stages.push({ id: stage.id, label: stage.label, outcome: 'not_reached', reasons: [] })
      return
    }

    const blocker = blocking.get(stage.id)
    if (blocker) {
      haltedAt = index
      stages.push({
        id: stage.id,
        label: stage.label,
        outcome: 'blocked',
        reasons: [blocker.action],
        blockedBy: blocker,
      })
      return
    }

    const reasons = unmetRequirements(stage.requires, dials)
    if (reasons.length > 0) {
      haltedAt = index
      stages.push({ id: stage.id, label: stage.label, outcome: 'failed', reasons })
      return
    }

    stages.push({ id: stage.id, label: stage.label, outcome: 'passed', reasons: [] })
  })

  const completed = haltedAt === null
  const halted = haltedAt === null ? null : stages[haltedAt]

  return {
    stages,
    haltedAt,
    completed,
    triangle: {
      // The diagnosed plant is by definition a susceptible host, and the
      // pathogen is by definition present — that is what a positive diagnosis
      // means. The environment leg is the only one the dials move, which is
      // exactly why it is the one the simulator exposes.
      host: true,
      pathogen: true,
      environment: completed,
    },
    summary: completed
      ? 'The cycle completed. New infectious units were produced and dispersed.'
      : halted?.outcome === 'blocked'
        ? `Stopped at ${halted.label}: ${halted.reasons[0] ?? ''}`
        : `Stopped at ${halted?.label}: ${halted?.reasons.join('; ') ?? ''}`,
  }
}

/**
 * The smallest dial change that would halt the cycle, or null if the cycle
 * already halts. Powers the "break it with one condition" hint.
 */
export function suggestBreak(cycle: DiseaseCycle, dials: Dials): string | null {
  const baseline = runCycle(cycle, dials)
  if (!baseline.completed) return null

  for (const key of ['leaf_wetness_hr', 'rh_pct', 'temp_c'] as const) {
    for (const stage of cycle.stages) {
      const bounds = stage.requires[key]
      if (!bounds) continue
      const [lo] = bounds
      if (dials[key] >= lo) {
        const probe = { ...dials, [key]: Math.max(0, lo - 1) }
        if (!runCycle(cycle, probe).completed) {
          return `Drop ${LABEL[key]} below ${lo}${UNIT[key]} and the cycle stalls at ${stage.label.toLowerCase()}.`
        }
      }
    }
  }
  return null
}
