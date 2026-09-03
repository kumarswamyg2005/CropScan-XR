import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import CycleStages from '../components/CycleStages'
import DeterminationLabel from '../components/DeterminationLabel'
import SeverityScale from '../components/SeverityScale'
import Specimen from '../components/Specimen'
import { ErrorNote, Loading, NotFound } from '../components/Status'
import { api } from '../lib/api'
import { useLang } from '../lib/lang'

const TABS = ['symptoms', 'organic', 'chemical', 'prevention'] as const
type Tab = (typeof TABS)[number]

export default function ResultPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang } = useLang()
  const [tab, setTab] = useState<Tab>('symptoms')

  const scanQuery = useQuery({
    queryKey: ['scan', id, lang],
    queryFn: () => api.getScan(id!, lang),
    enabled: Boolean(id),
  })

  const cycleQuery = useQuery({
    queryKey: ['cycle', scanQuery.data?.disease_id, lang],
    queryFn: () => api.getCycle(scanQuery.data!.disease_id!, lang),
    enabled: Boolean(scanQuery.data?.disease_id && scanQuery.data.has_cycle),
  })

  if (scanQuery.isPending) return <Loading />
  if (scanQuery.isError) return <ErrorNote message={String(scanQuery.error)} />
  if (!scanQuery.data) return <NotFound />

  const scan = scanQuery.data
  const info = scan.info

  return (
    <div className="py-10">
      <div className="grid gap-6 sm:grid-cols-[3fr_2fr]">
        <div>
          <Specimen
            imageUrl={scan.image_url}
            gradcamUrl={scan.gradcam_url}
            alt={info ? `${info.name} on ${info.plant}` : 'Uploaded leaf specimen'}
          />
          {info && !info.is_healthy && (
            <div className="mt-4">
              <SeverityScale severity={info.severity} label={info.severity ?? '—'} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <DeterminationLabel scan={scan} />

          {/* Uncertain is calm, never a red error state. The system not knowing
              is a correct outcome and is presented as one (issue #32). */}
          {scan.status === 'uncertain' && (
            <div className="plate p-4">
              <p className="text-sm">{t('uncertainBody')}</p>
              <Link
                to="/scan"
                className="mt-3 inline-block border border-ink px-3 py-1.5 text-sm"
              >
                {t('retake')}
              </Link>
            </div>
          )}

          <div className="plate p-4">
            {scan.can_enter_field ? (
              <Link
                to={`/field?scan=${scan.id}`}
                className="block border border-ink bg-ink px-4 py-2 text-center text-sheet"
              >
                {t('enterField')}
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  aria-describedby="field-blocked"
                  className="w-full cursor-not-allowed border border-rule px-4 py-2 text-ink-soft"
                >
                  {t('enterField')}
                </button>
                {/* The server computes the reason, so the 2D and XR surfaces
                    cannot disagree about whether the module may launch. */}
                <p id="field-blocked" className="determination mt-2">
                  {scan.field_blocked_reason}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {scan.top3.length > 1 && (
        <section className="mt-8">
          <h2 className="determination !text-ink">{t('alsoConsidered')}</h2>
          <ul className="determination mt-2 list-none space-y-1 p-0">
            {scan.top3.slice(1).map((candidate) => (
              <li key={candidate.disease_id} className="flex justify-between border-b border-rule py-1">
                <Link
                  to={`/diseases/${encodeURIComponent(candidate.disease_id)}`}
                  className="text-ink underline underline-offset-2"
                >
                  {candidate.disease_id.replaceAll('___', ' · ').replaceAll('_', ' ')}
                </Link>
                <span>{candidate.confidence.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {info && !info.is_healthy && (
        <section className="mt-8">
          <div className="flex flex-wrap gap-1 border-b border-rule" role="tablist">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
                className={`px-3 py-2 text-sm ${
                  tab === name ? 'border-b-2 border-ink text-ink' : 'text-ink-soft'
                }`}
              >
                {t(name)}
              </button>
            ))}
          </div>
          <p role="tabpanel" className="mt-4 max-w-prose">
            {info[tab] ?? '—'}
          </p>
        </section>
      )}

      {cycleQuery.data?.cycle && <CycleStages cycle={cycleQuery.data.cycle} />}
    </div>
  )
}
