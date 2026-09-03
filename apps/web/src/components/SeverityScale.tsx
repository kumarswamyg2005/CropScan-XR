import { TISSUE_RAMP, token } from '../tokens'
import { useLang } from '../lib/lang'

/**
 * A lesion-grading chart. The tissue ramp used as an actual measuring
 * instrument, which is what earns those four colours a place in the palette.
 *
 * The reading is always stated in text as well as colour -- this ramp runs
 * green to brown, and red-green colour deficiency is common.
 */
export default function SeverityScale({
  severity,
  label,
}: {
  severity: string | null | undefined
  label: string
}) {
  const { t } = useLang()

  const index = { low: 0, mild: 0, moderate: 1, high: 2, severe: 3 }[
    (severity ?? '').toLowerCase()
  ]
  const filled = index === undefined ? -1 : index

  return (
    <div>
      <div
        className="flex gap-0.5"
        role="img"
        aria-label={`${t('severity')}: ${label}`}
      >
        {TISSUE_RAMP.map((name, i) => (
          <span
            key={name}
            className="h-2 flex-1 border border-rule"
            // Computed: which steps are filled is data, not a style constant.
            style={{ background: i <= filled ? token(name) : 'transparent' }}
          />
        ))}
      </div>
      <p className="determination mt-1 flex justify-between">
        <span>{label}</span>
        <span aria-hidden="true">{t('healthyToNecrotic')}</span>
      </p>
    </div>
  )
}
