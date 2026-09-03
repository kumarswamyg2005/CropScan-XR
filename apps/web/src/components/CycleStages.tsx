import type { CycleRequires, DiseaseCycle } from '../lib/api'
import { useLang } from '../lib/lang'
import { token } from '../tokens'

/** "6–26 °C", "≥ 9 h", "—". Ranges come from the knowledge base, not from here. */
function formatRange(range: [number, number] | null, unit: string): string {
  if (!range) return '—'
  const [lo, hi] = range
  if (hi >= 999) return `≥ ${lo}${unit}`
  return `${lo}–${hi}${unit}`
}

function Requirements({ requires }: { requires: CycleRequires }) {
  const { t } = useLang()
  const parts: string[] = []
  if (requires.temp_c) parts.push(`${t('temperature')} ${formatRange(requires.temp_c, ' °C')}`)
  if (requires.leaf_wetness_hr)
    parts.push(`${t('leafWetness')} ${formatRange(requires.leaf_wetness_hr, ' h')}`)
  if (requires.rh_pct) parts.push(`${t('humidity')} ${formatRange(requires.rh_pct, '%')}`)

  if (parts.length === 0) return null
  return (
    <p className="determination mt-1">
      {t('needs')}: {parts.join(' · ')}
    </p>
  )
}

/**
 * The 2D version of the XR content: nine stages, what each needs, and where an
 * intervention breaks the chain.
 *
 * Every claim on screen traces to a field in data/disease_cycle.json. Nothing
 * here is invented for the layout.
 */
export default function CycleStages({ cycle }: { cycle: DiseaseCycle }) {
  const { t } = useLang()

  const byStage = new Map<string, DiseaseCycle['interventions']>()
  for (const iv of cycle.interventions) {
    byStage.set(iv.stage_id, [...(byStage.get(iv.stage_id) ?? []), iv])
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg">{t('howItGotSick')}</h2>

      <dl className="determination mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt>{t('pathogen')}</dt>
        <dd className="m-0 text-ink">
          <em>{cycle.pathogen.name}</em> ({cycle.pathogen.type})
        </dd>
        <dt>{t('cycleType')}</dt>
        <dd className="m-0 text-ink">{cycle.cycle_type}</dd>
        <dt>{t('overwinters')}</dt>
        <dd className="m-0 text-ink">{cycle.overseasoning}</dd>
        <dt>{t('spreadBy')}</dt>
        <dd className="m-0 text-ink">{cycle.dispersal.join(', ').replaceAll('_', ' ')}</dd>
      </dl>

      {cycle.note && <p className="plate mt-4 p-3 text-sm">{cycle.note}</p>}

      <ol className="mt-6 list-none space-y-0 p-0">
        {cycle.stages.map((stage, i) => {
          const stageInterventions = byStage.get(stage.id) ?? []
          return (
            <li key={stage.id} className="border-t border-rule py-4 first:border-t-0">
              <div className="flex items-baseline gap-3">
                <span className="determination">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-md">{stage.label}</h3>
                {stage.visible && (
                  <span
                    className="determination"
                    // Computed: the marker colour encodes "symptoms are visible
                    // from here on", which is a data property of the stage.
                    style={{ color: token('necrosis') }}
                  >
                    visible
                  </span>
                )}
              </div>

              <p className="mt-1 max-w-prose">{stage.what_happens}</p>
              <p className="determination mt-1">{stage.duration_hint}</p>
              <Requirements requires={stage.requires} />

              {stageInterventions.length > 0 && (
                <ul className="mt-3 list-none space-y-2 border-l-2 border-chlorophyll p-0 pl-3">
                  {stageInterventions.map((iv) => (
                    <li key={iv.action}>
                      <span className="determination !text-chlorophyll">
                        {t('interventions')} · {iv.kind.replaceAll('_', ' ')} · {iv.effect.replaceAll('_', ' ')}
                      </span>
                      <p className="mt-0.5 text-sm">{iv.action}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      <details className="mt-6">
        <summary className="determination cursor-pointer">{t('sources')}</summary>
        <ul className="determination mt-2 space-y-1">
          {cycle.sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}
