/**
 * Token access for both renderers.
 *
 * The palette is defined ONCE, in src/index.css under Tailwind v4's @theme
 * block. This module does not restate it -- it reads the computed custom
 * properties off the document. That is what keeps the 2D app and the
 * @react-three/uikit panels on one palette instead of two that drift.
 *
 * Three.js needs numbers, not CSS strings, hence `tokenHex`.
 */

export const TOKEN_NAMES = [
  'ground',
  'sheet',
  'ink',
  'ink-soft',
  'rule',
  'chlorophyll',
  'chlorosis',
  'necrosis',
  'sporulation',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]

/** Used only when there is no document to read from (SSR, unit tests). */
const FALLBACK = '#000000'

export function token(name: TokenName): string {
  if (typeof document === 'undefined') return FALLBACK
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim()
  if (!value && import.meta.env.DEV) {
    console.warn(`token "${name}" is not defined in index.css @theme`)
  }
  return value || FALLBACK
}

/** 0xRRGGBB, for three.js materials and uikit panels. */
export function tokenHex(name: TokenName): number {
  const value = token(name)
  return Number.parseInt(value.replace('#', ''), 16) || 0
}

/**
 * The tissue ramp, ordered healthy -> dead. Used by the lesion-severity scale
 * and by the confidence meter. Order is meaningful: it IS the scale.
 */
export const TISSUE_RAMP: TokenName[] = [
  'chlorophyll',
  'chlorosis',
  'necrosis',
  'sporulation',
]

/**
 * Severity to a tissue colour.
 *
 * Colour is never the only channel -- every caller pairs this with the text
 * label, because a red-green colour deficiency is common and this ramp runs
 * green to brown.
 */
export function severityToken(severity: string | null | undefined): TokenName {
  switch ((severity ?? '').toLowerCase()) {
    case 'low':
    case 'mild':
      return 'chlorosis'
    case 'high':
    case 'severe':
      return 'necrosis'
    case 'moderate':
      return 'necrosis'
    default:
      return 'ink-soft'
  }
}

/**
 * Confidence to a tissue colour.
 *
 * Note there is no "uncertain" colour. An uncertain result is styled calm in
 * --ink-soft, never red: the system not knowing is a correct outcome and is
 * presented as one (docs/design_plan.md section 5).
 */
export function confidenceToken(confidence: number): TokenName {
  if (confidence >= 0.85) return 'chlorophyll'
  if (confidence >= 0.6) return 'chlorosis'
  return 'ink-soft'
}
