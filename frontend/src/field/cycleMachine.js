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
 *
 * Sentences come from the locale files; `lang` defaults to English.
 */

import { translate } from '../i18n'

const KEYS = ['temp_c', 'leaf_wetness_hr', 'rh_pct']
const unit = (key, lang) =>
  key === 'temp_c' ? ' °C' : key === 'rh_pct' ? '%' : translate(lang, 'unit.hours')
const label = (key, lang) => translate(lang, `dial.${key}`)

/**
 * Which requirements this stage fails at these dial settings.
 *
 * Mirrors Requires.unmet() in services/api/app/cycle.py. Both read the same
 * JSON, and keeping the wording identical means the headset and the web page
 * say the same sentence about the same failure.
 */
export function unmetRequirements(requires, dials, lang = 'en') {
  const failures = []
  for (const key of KEYS) {
    const bounds = requires[key]
    if (!bounds) continue
    const value = dials[key]
    const [lo, hi] = bounds
    const vars = { label: label(key, lang), value, unit: unit(key, lang) }
    if (value < lo) {
      failures.push(translate(lang, 'cycle.below', { ...vars, bound: lo }))
    } else if (value > hi) {
      failures.push(translate(lang, 'cycle.above', { ...vars, bound: hi }))
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
export function runCycle(cycle, dials, appliedInterventions = [], lang = 'en') {
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

    const reasons = unmetRequirements(stage.requires, dials, lang)
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
      ? translate(lang, 'cycle.completed')
      : translate(lang, 'cycle.stopped', {
          stage: halted.label,
          reasons: halted.outcome === 'blocked' ? (halted.reasons[0] ?? '') : halted.reasons.join('; '),
        }),
  }
}

/** The smallest single change that would halt the cycle, or null if it already does. */
export function suggestBreak(cycle, dials, lang = 'en') {
  if (!runCycle(cycle, dials).completed) return null

  for (const key of ['leaf_wetness_hr', 'rh_pct', 'temp_c']) {
    for (const stage of cycle.stages) {
      const bounds = stage.requires[key]
      if (!bounds) continue
      const lo = bounds[0]
      if (dials[key] >= lo) {
        const probe = { ...dials, [key]: Math.max(0, lo - 1) }
        if (!runCycle(cycle, probe).completed) {
          return translate(lang, 'cycle.suggest', {
            label: label(key, lang), bound: lo, unit: unit(key, lang), stage: stage.label.toLowerCase(),
          })
        }
      }
    }
  }
  return null
}
