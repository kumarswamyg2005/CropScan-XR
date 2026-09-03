/**
 * The disease-cycle stage machine.
 *
 * This is the disease triangle as code: susceptible host x virulent pathogen x
 * favourable environment. Remove a leg and the cycle stalls. Drop leaf wetness
 * below the pathogen's threshold and the stage FAILS and the run halts -- that
 * failure is the pedagogy, not an error state.
 *
 * Pure: no three.js, no React, no clock. Everything it decides comes from
 * data/disease_cycle.json plus three dial values, so it is testable and no
 * claim shown over the video can drift from the knowledge base.
 */

const UNIT = { temp_c: ' °C', leaf_wetness_hr: ' h', rh_pct: '%' }
const LABEL = { temp_c: 'temperature', leaf_wetness_hr: 'leaf wetness', rh_pct: 'humidity' }
const KEYS = ['temp_c', 'leaf_wetness_hr', 'rh_pct']

/**
 * Which requirements this stage fails at these dial settings.
 *
 * Mirrors Requires.unmet() in services/api/app/cycle.py. Both read the same
 * JSON, and keeping the wording identical means the headset and the web page
 * say the same sentence about the same failure.
 */
export function unmetRequirements(requires, dials) {
  const failures = []
  for (const key of KEYS) {
    const bounds = requires[key]
    if (!bounds) continue
    const value = dials[key]
    const [lo, hi] = bounds
    if (value < lo) {
      failures.push(`${LABEL[key]} is ${value}${UNIT[key]}, below the ${lo}${UNIT[key]} this stage needs`)
    } else if (value > hi) {
      failures.push(`${LABEL[key]} is ${value}${UNIT[key]}, above the ${hi}${UNIT[key]} this stage tolerates`)
    }
  }
  return failures
}

/**
 * Slider ranges, widened past the pathogen's band so the user can actually
 * leave the favourable zone. A slider that cannot fail the cycle teaches
 * nothing.
 */
export function dialRanges(cycle) {
  const env = cycle.environment || {}
  return {
    temp_c: { min: 0, max: 45, step: 1, initial: Math.round(env.temp_c?.optimal ?? 20) },
    leaf_wetness_hr: { min: 0, max: 48, step: 1, initial: Math.round(env.leaf_wetness_hr?.optimal ?? 12) },
    rh_pct: { min: 0, max: 100, step: 1, initial: Math.round(env.rh_pct?.optimal ?? 90) },
  }
}

export function optimalDials(cycle) {
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
 * An intervention whose effect is 'blocks' stops the cycle at its stage.
 * 'reduces_inoculum' and 'slows' do not halt it -- they are honest about being
 * partial controls, which matters, because telling someone that raking leaves
 * eradicates apple scab would be wrong.
 */
export function runCycle(cycle, dials, appliedInterventions = []) {
  const blocking = new Map()
  for (const iv of appliedInterventions) {
    if (iv.effect === 'blocks') blocking.set(iv.stage_id, iv)
  }

  const stages = []
  let haltedAt = null

  cycle.stages.forEach((stage, index) => {
    if (haltedAt !== null) {
      stages.push({ id: stage.id, label: stage.label, outcome: 'not_reached', reasons: [] })
      return
    }

    const blocker = blocking.get(stage.id)
    if (blocker) {
      haltedAt = index
      stages.push({
        id: stage.id, label: stage.label, outcome: 'blocked',
        reasons: [blocker.action], blockedBy: blocker,
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
      // The diagnosed plant is by definition a susceptible host and the
      // pathogen is by definition present -- that is what a positive diagnosis
      // means. The environment leg is the only one the dials move, which is
      // why it is the one the simulator exposes.
      host: true,
      pathogen: true,
      environment: completed,
    },
    summary: completed
      ? 'The cycle completed. New infectious units were produced and dispersed.'
      : halted.outcome === 'blocked'
        ? `Stopped at ${halted.label}: ${halted.reasons[0] ?? ''}`
        : `Stopped at ${halted.label}: ${halted.reasons.join('; ')}`,
  }
}

/** The smallest single change that would halt the cycle, or null if it already does. */
export function suggestBreak(cycle, dials) {
  if (!runCycle(cycle, dials).completed) return null

  for (const key of ['leaf_wetness_hr', 'rh_pct', 'temp_c']) {
    for (const stage of cycle.stages) {
      const bounds = stage.requires[key]
      if (!bounds) continue
      const lo = bounds[0]
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
