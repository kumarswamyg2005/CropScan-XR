import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { ErrorNote, Loading } from '../components/Status'
import { api, type Intervention } from '../lib/api'
import { useLang } from '../lib/lang'
import { token } from '../tokens'
import FieldScene, { type SceneName } from '../field/FieldScene'
import {
  dialRanges,
  optimalDials,
  runCycle,
  suggestBreak,
  type Dials,
} from '../field/cycleMachine'
import { xrStore } from '../field/store'

function useXrSupport() {
  const [supported, setSupported] = useState<boolean | null>(null)
  useEffect(() => {
    const xr = navigator.xr
    if (!xr) {
      setSupported(false)
      return
    }
    let cancelled = false
    void xr
      .isSessionSupported('immersive-vr')
      .then((ok) => !cancelled && setSupported(ok))
      .catch(() => !cancelled && setSupported(false))
    return () => {
      cancelled = true
    }
  }, [])
  return supported
}

export default function FieldPage() {
  const { t, lang } = useLang()
  const [params] = useSearchParams()
  const scanId = params.get('scan')
  const diseaseParam = params.get('disease')
  const xrSupported = useXrSupport()

  const [scene, setScene] = useState<SceneName>('row')
  const [currentStage, setCurrentStage] = useState(0)
  const [applied, setApplied] = useState<Intervention[]>([])
  const [dials, setDials] = useState<Dials | null>(null)

  const scanQuery = useQuery({
    queryKey: ['scan', scanId, lang],
    queryFn: () => api.getScan(scanId!, lang),
    enabled: Boolean(scanId),
  })

  const diseaseId = scanQuery.data?.disease_id ?? diseaseParam
  const cycleQuery = useQuery({
    queryKey: ['cycle', diseaseId, lang],
    queryFn: () => api.getCycle(diseaseId!, lang),
    enabled: Boolean(diseaseId),
  })

  const cycle = cycleQuery.data?.cycle ?? null

  useEffect(() => {
    if (cycle && !dials) setDials(optimalDials(cycle))
  }, [cycle, dials])

  const run = useMemo(
    () => (cycle && dials ? runCycle(cycle, dials, applied) : null),
    [cycle, dials, applied],
  )
  const hint = useMemo(
    () => (cycle && dials ? suggestBreak(cycle, dials) : null),
    [cycle, dials],
  )

  // A scan the server refuses to let into the field cannot get in here either.
  const blocked = scanQuery.data && !scanQuery.data.can_enter_field
  if (blocked) {
    return (
      <div className="py-10">
        <h1 className="text-xl">{t('fieldModule')}</h1>
        <div className="plate mt-6 max-w-xl p-4">
          <p>{scanQuery.data.field_blocked_reason}</p>
          <Link to="/scan" className="mt-3 inline-block border border-ink px-3 py-1.5 text-sm">
            {t('retake')}
          </Link>
        </div>
      </div>
    )
  }

  if (scanId && scanQuery.isPending) return <Loading />
  if (cycleQuery.isError) return <ErrorNote message={String(cycleQuery.error)} />

  if (!diseaseId || !cycle || !dials || !run) {
    return (
      <div className="py-10">
        <h1 className="text-xl">{t('fieldModule')}</h1>
        <p className="mt-3 max-w-xl">{t('fieldIntro')}</p>
        <p className="determination mt-6">
          <Link to="/diseases" className="underline underline-offset-2">
            {t('browseDiseases')}
          </Link>
        </p>
      </div>
    )
  }

  const ranges = dialRanges(cycle)
  const sliders = [
    { key: 'temp_c' as const, label: t('temperature'), unit: '°C' },
    { key: 'leaf_wetness_hr' as const, label: t('leafWetness'), unit: 'h' },
    { key: 'rh_pct' as const, label: t('humidity'), unit: '%' },
  ]

  return (
    <div className="py-10">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl">{t('fieldModule')}</h1>
        <p className="determination">{cycle.pathogen.name}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          <div className="plate aspect-[4/3] overflow-hidden">
            <FieldScene
              cycle={cycle}
              scene={scene}
              dials={dials}
              currentStage={currentStage}
              interventions={applied}
              gradcamUrl={scanQuery.data?.gradcam_url ?? null}
              diseaseName={scanQuery.data?.info?.name ?? diseaseId.split('___')[1] ?? ''}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void xrStore.enterVR()}
              disabled={xrSupported !== true}
              className="border border-ink bg-ink px-4 py-2 text-sheet disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-ink-soft"
            >
              {t('enterInVR')}
            </button>
            <button
              type="button"
              onClick={() => setScene(scene === 'row' ? 'theatre' : 'row')}
              className="border border-ink px-4 py-2"
            >
              {scene === 'row' ? 'Infection Theatre' : 'The Row'}
            </button>
            <span className="determination self-center">
              {xrSupported === true ? t('headsetSupported') : t('headsetMissing')}
            </span>
          </div>

          {xrSupported === false && (
            <p className="determination mt-2">{t('desktopFallback')}</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="plate p-4">
            <h2 className="determination !text-ink border-b border-rule pb-1">
              {t('environment')}
            </h2>

            {sliders.map((slider) => (
              <label key={slider.key} className="mt-4 block">
                <span className="determination flex justify-between">
                  <span>{slider.label}</span>
                  <span className="text-ink">
                    {dials[slider.key]} {slider.unit}
                  </span>
                </span>
                <input
                  type="range"
                  min={ranges[slider.key].min}
                  max={ranges[slider.key].max}
                  step={ranges[slider.key].step}
                  value={dials[slider.key]}
                  onChange={(e) =>
                    setDials({ ...dials, [slider.key]: Number(e.target.value) })
                  }
                  className="mt-1 w-full accent-chlorophyll"
                />
              </label>
            ))}

            <div className="mt-4 flex gap-2 border-t border-rule pt-3">
              <button
                type="button"
                onClick={() => {
                  setScene('theatre')
                  setCurrentStage(
                    run.haltedAt !== null ? run.haltedAt : cycle.stages.length - 1,
                  )
                }}
                className="border border-ink bg-ink px-3 py-1.5 text-sm text-sheet"
              >
                {t('play')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDials(optimalDials(cycle))
                  setApplied([])
                  setCurrentStage(0)
                }}
                className="border border-ink px-3 py-1.5 text-sm"
              >
                {t('reset')}
              </button>
            </div>
          </div>

          <div className="plate p-4">
            <h2 className="determination !text-ink border-b border-rule pb-1">
              {t('diseaseTriangle')}
            </h2>
            <dl className="determination mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {(
                [
                  [t('host'), run.triangle.host],
                  [t('pathogen'), run.triangle.pathogen],
                  [t('environment'), run.triangle.environment],
                ] as const
              ).map(([label, lit]) => (
                <div key={label} className="contents">
                  <dt>{label}</dt>
                  <dd
                    className="m-0 text-right"
                    style={{ color: token(lit ? 'chlorophyll' : 'necrosis') }}
                  >
                    {lit ? 'satisfied' : 'broken'}
                  </dd>
                </div>
              ))}
            </dl>

            <p
              className="mt-3 border-t border-rule pt-3 text-sm"
              style={{ color: token(run.completed ? 'ink' : 'necrosis') }}
              role="status"
            >
              {run.completed ? run.summary : `${t('cycleHalted')}. ${run.summary}`}
            </p>

            {hint && <p className="determination mt-2">{hint}</p>}
          </div>

          <div className="plate p-4">
            <h2 className="determination !text-ink border-b border-rule pb-1">
              {t('interventions')}
            </h2>
            <ul className="mt-3 list-none space-y-2 p-0">
              {cycle.interventions.map((iv) => {
                const on = applied.includes(iv)
                return (
                  <li key={iv.action}>
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setApplied(
                            on ? applied.filter((x) => x !== iv) : [...applied, iv],
                          )
                        }
                        className="mt-1 shrink-0 accent-chlorophyll"
                      />
                      <span>
                        {iv.action}
                        <span className="determination block">
                          {iv.stage_id} · {iv.effect.replaceAll('_', ' ')}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      <ol className="determination mt-8 list-none space-y-0 p-0">
        {run.stages.map((stage, i) => (
          <li key={stage.id}>
            <button
              type="button"
              onClick={() => {
                setScene('theatre')
                setCurrentStage(i)
              }}
              className="flex w-full items-baseline gap-3 border-b border-rule py-2 text-left"
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              <span className="text-ink">{stage.label}</span>
              <span
                className="ml-auto"
                style={{
                  color: token(
                    stage.outcome === 'passed'
                      ? 'chlorophyll'
                      : stage.outcome === 'not_reached'
                        ? 'ink-soft'
                        : 'necrosis',
                  ),
                }}
              >
                {stage.outcome.replaceAll('_', ' ')}
              </span>
            </button>
            {stage.reasons.length > 0 && (
              <p className="py-1 pl-9" style={{ color: token('necrosis') }}>
                {stage.reasons.join('; ')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
