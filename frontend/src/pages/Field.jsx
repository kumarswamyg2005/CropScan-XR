import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api } from '../lib/api'
import ErrorBoundary from '../components/ErrorBoundary'
import VideoOptions from '../components/VideoOptions'
import { useLang } from '../context/LanguageContext'
import { dialRanges, optimalDials, runCycle, suggestBreak } from '../field/cycleMachine'

// The one lazy route. three.js and the XR stack live behind this import so the
// rest of the site never downloads them.
const FieldScene = lazy(() => import('../field/FieldScene'))

/** User-facing message for a failed request. The raw one goes to the console. */
function describe(error, t) {
  if (error?.status === 404) return t('field.err404')
  if (error?.status >= 500) return t('field.err5xx')
  return t('field.errNetwork')
}

/** Why a scan may not enter, in the reader's language. The server's English
    sentence is the fallback for a reason this page does not know about. */
function blockedReason(scan, t) {
  if (scan.status === 'uncertain') return t('result.blockedUncertain')
  if (!scan.hasCycle) return t('result.blockedNoCycle')
  return scan.fieldBlockedReason
}

function useWebglSupport() {
  const [ok, setOk] = useState(null)
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      setOk(Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')))
    } catch {
      setOk(false)
    }
  }, [])
  return ok
}

function useXrSupport() {
  const [supported, setSupported] = useState(null)
  useEffect(() => {
    const xr = navigator.xr
    if (!xr) return setSupported(false)
    let alive = true
    const check = () => navigator.xr
      .isSessionSupported('immersive-vr')
      .then((ok) => alive && setSupported(ok))
      .catch(() => alive && setSupported(false))
    check()
    // A headset connected after load (or the dev emulator installing) fires
    // devicechange; without this the button stays disabled until a reload.
    xr.addEventListener?.('devicechange', check)
    return () => {
      alive = false
      xr.removeEventListener?.('devicechange', check)
    }
  }, [])
  return supported
}

const card = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: 'var(--space-lg)',
}

export default function Field() {
  const { lang, t } = useLang()
  const [params, setParams] = useSearchParams()
  const xrSupported = useXrSupport()
  const webglSupported = useWebglSupport()

  const scanId = params.get('scan')
  const diseaseParam = params.get('disease')

  // The selected disease lives in the URL, not in component state.
  //
  // It used to be state, which meant picking a disease changed the screen
  // without adding a history entry -- so one Back press skipped straight past
  // the picker to whatever came before /field, and felt like two presses. It
  // also made the view unshareable and unbookmarkable.
  //
  // A disease derived from a ?scan= lookup stays in state on purpose: it is a
  // consequence of the scan already in the URL, not a separate step to go back to.
  const [scanDisease, setScanDisease] = useState(null)
  const diseaseId = diseaseParam ?? scanDisease

  const pickDisease = useCallback(
    (id) => setParams(id ? { disease: id } : {}),
    [setParams],
  )
  const [cycle, setCycle] = useState(null)
  const [videos, setVideos] = useState([])
  const [videoIndex, setVideoIndex] = useState(0)
  const [choices, setChoices] = useState([])
  const [choicesFailed, setChoicesFailed] = useState(false)
  const [choicesAttempt, setChoicesAttempt] = useState(0)
  const [dials, setDials] = useState(null)
  const [media, setMedia] = useState({ element: null, playback: null })
  const [highlightStage, setHighlightStage] = useState(null)
  const [playing, setPlaying] = useState(false)
  // `blocked` is the server refusing this scan entry -- a real gate, and a
  // full-page stop is right for it. `loadError` is a fetch that failed, which
  // must NOT hide the picker: the disease is component state with no history
  // entry, so blanking the page leaves the user with no way back to choose
  // another one and Back cannot restore it.
  const [blocked, setBlocked] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // A scan the server refuses to let into the field cannot get in here either.
  useEffect(() => {
    if (!scanId) return
    setBlocked(null)
    api.getScan(scanId, lang).then((scan) => {
      if (!scan.canEnterField) setBlocked(blockedReason(scan, t))
      else setScanDisease(scan.class_name)
    }).catch((e) => setBlocked(describe(e, t)))
  }, [scanId, lang, t])

  // A failed list used to be swallowed, leaving "pick a disease" above an
  // empty box with nothing to pick and no explanation.
  useEffect(() => {
    let alive = true
    setChoicesFailed(false)
    api.listDiseases({ hasCycle: true, lang })
      .then((list) => alive && setChoices(list))
      .catch((e) => {
        console.error('[CropScan] disease list fetch failed', e)
        if (alive) setChoicesFailed(true)
      })
    return () => { alive = false }
  }, [lang, choicesAttempt])

  useEffect(() => {
    if (!diseaseId) return
    // Cleared on every attempt. Without this a single transient failure sticks
    // forever: the retry succeeds, the cycle loads, and the stale error is
    // still on screen with no way to dismiss it short of a reload.
    setLoadError(null)
    setCycle(null)
    setDials(null)
    setVideos([])
    api.getCycle(diseaseId, lang).then((r) => {
      setCycle(r.cycle)
      if (r.cycle) setDials(optimalDials(r.cycle))
    }).catch((e) => {
      console.error('[CropScan] cycle fetch failed', e)
      setLoadError(e.status === 404 ? t('field.notFound', { id: diseaseId }) : describe(e, t))
    })
    api.listVideos(diseaseId, lang)
      .then((v) => {
        // Real footage first. The synthetic 360 clip exists to keep the
        // equirect code path exercised, not to be the first thing anyone sees.
        const ordered = [...v].sort(
          (a, b) =>
            Number((a.license ?? '').startsWith('Generated')) -
            Number((b.license ?? '').startsWith('Generated')),
        )
        setVideos(ordered)
        setVideoIndex(0)
      })
      .catch(() => {})
  }, [diseaseId, lang, t])

  // Hooks must run in the same order on every render. This was previously
  // written inline in the JSX below, inside the `diseaseId && (...)` branch and
  // after two early returns, so selecting a disease added a hook that had not
  // existed on the previous render: "Rendered more hooks than during the
  // previous render". Every hook in this component belongs above the returns.
  const handleMedia = useCallback(
    (element, playback) => setMedia({ element, playback }),
    [],
  )

  // Mirrored to the in-VR panel, which has no DOM to read state from.
  useEffect(() => {
    const el = media.element
    if (!el) return
    const sync = () => setPlaying(!el.paused)
    el.addEventListener('play', sync)
    el.addEventListener('pause', sync)
    sync()
    return () => {
      el.removeEventListener('play', sync)
      el.removeEventListener('pause', sync)
    }
  }, [media.element])

  const togglePlay = useCallback(() => {
    const { element, playback } = media
    if (!element || !playback) return
    if (element.paused) playback.play(element).catch(() => {})
    else playback.pause()
  }, [media])

  const run = useMemo(() => (cycle && dials ? runCycle(cycle, dials, [], lang) : null), [cycle, dials, lang])
  const hint = useMemo(() => (cycle && dials ? suggestBreak(cycle, dials, lang) : null), [cycle, dials, lang])
  const video = videos[videoIndex] ?? null
  // The API has already resolved these into the current language.
  const stageLabels = useMemo(
    () => Object.fromEntries((cycle?.stages ?? []).map((s) => [s.id, s.label])),
    [cycle],
  )

  const canEnterVR = xrSupported === true && webglSupported !== false

  if (blocked) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--space-2xl) var(--space-lg)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, marginBottom: 12 }}>{t('field.title')}</h1>
        <div style={{ ...card, borderLeft: '3px solid var(--color-alert)' }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{blocked}</p>
          <Link to="/detect" className="btn-secondary" style={{ marginTop: 16, display: 'inline-block' }}>
            {t('field.scanAgain')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6" style={{ maxWidth: 1180, margin: '0 auto', paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)' }}>
      <div className="label-caps" style={{ marginBottom: 8 }}>WebXR</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 38px)', margin: '0 0 8px' }}>{t('field.title')}</h1>
      <p style={{ color: 'var(--color-text-muted)', maxWidth: 620, marginBottom: 'var(--space-xl)' }}>{t('field.intro')}</p>

      {loadError && (
        <div
          role="alert"
          style={{
            ...card,
            borderLeft: '3px solid var(--color-alert)',
            marginBottom: 'var(--space-lg)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{loadError}</span>
          <button
            className="btn-secondary"
            style={{ fontSize: 13 }}
            onClick={() => {
              setScanDisease(null)
              setCycle(null)
              setVideos([])
              setDials(null)
              setLoadError(null)
              pickDisease(null)
            }}
          >
            {t('field.pickAnother')}
          </button>
        </div>
      )}

      {!diseaseId && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)]">
          <div style={card}>
            <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>{t('field.pick')}</p>
            {choicesFailed && (
              <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12, color: 'var(--color-alert)', fontSize: 14 }}>
                <span>{t('field.listFailed')}</span>
                <button className="btn-secondary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => setChoicesAttempt((n) => n + 1)}>
                  {t('field.retry')}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {choices.map((d) => (
                <button
                  key={d.id}
                  onClick={() => pickDisease(d.id)}
                  className="btn-secondary"
                  style={{ fontSize: 14 }}
                >
                  {d.name}
                  {d.has_video && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-accent)' }} aria-label={t('field.hasFootage')}>
                      ▶
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p style={{
              marginBottom: 0, marginTop: 20, paddingTop: 16,
              borderTop: '1px solid var(--color-border)',
              fontSize: 13, color: 'var(--color-text-muted)',
            }}>
              {t('field.legend')}
            </p>
          </div>

          <div style={{ ...card, background: 'var(--color-surface-raised)' }}>
            <div className="label-caps" style={{ marginBottom: 12 }}>
              {t('field.whatsHere')}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              {['field.whats1', 'field.whats2', 'field.whats3', 'field.whats4'].map((key) => t(key)).map((line) => (
                <li key={line} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: 'var(--color-accent)' }}>—</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p style={{
              margin: '16px 0 0', paddingTop: 14,
              borderTop: '1px solid var(--color-border)',
              fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5,
            }}>
              {t('field.xrNote')}
            </p>
          </div>
        </div>
      )}

      {diseaseId && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
          <div>
            <div style={{
              position: 'relative', aspectRatio: '16 / 10', borderRadius: 12, overflow: 'hidden',
              border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)',
            }}>
              {webglSupported === false ? (
                <div style={{
                  display: 'grid', placeItems: 'center', height: '100%',
                  padding: 24, textAlign: 'center', color: 'var(--color-text-muted)',
                }}>
                  <p style={{ margin: 0, maxWidth: 380 }}>
                    {t('field.webglMissing')}
                  </p>
                </div>
              ) : (
              <ErrorBoundary title={t('field.sceneFailed')}>
              <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--color-text-muted)' }}>{t('field.loadingScene')}</div>}>
                <FieldScene
                  video={video}
                  run={run}
                  pathogen={cycle?.pathogen?.name}
                  onElement={handleMedia}
                  dials={dials}
                  ranges={cycle ? dialRanges(cycle) : null}
                  onDial={(key, value) => setDials((d) => ({ ...d, [key]: value }))}
                  onReset={() => cycle && setDials(optimalDials(cycle))}
                  videos={videos}
                  videoIndex={videoIndex}
                  onPickVideo={setVideoIndex}
                  playing={playing}
                  onTogglePlay={togglePlay}
                  t={t}
                />
              </Suspense>
              </ErrorBoundary>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <button
                className="btn-primary"
                disabled={!canEnterVR}
                onClick={() => import('../field/FieldScene').then((m) => m.xrStore.enterVR())}
                style={!canEnterVR ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              >
                {t('field.enterVR')}
              </button>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--color-text-muted)',
              }}>
                {video ? (video.projection === 'flat' ? t('video.panel2d') : '360°') : t('field.noVideo')}
              </span>
            </div>

            {xrSupported === false && (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8 }}>{t('field.noHeadset')}</p>
            )}

            <VideoOptions
              videos={videos}
              index={videoIndex}
              onPick={setVideoIndex}
              element={media.element}
              playback={media.playback}
              t={t}
              stageLabels={stageLabels}
              onJumpToStage={setHighlightStage}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            {cycle && dials && (
              <div style={card}>
                <div className="label-caps" style={{ marginBottom: 14 }}>{t('field.environment')}</div>
                {[
                  ['temp_c', t('field.temperature'), '°C'],
                  ['leaf_wetness_hr', t('field.wetness'), t('unit.hours').trim()],
                  ['rh_pct', t('field.humidity'), '%'],
                ].map(([key, label, unit]) => {
                  const r = dialRanges(cycle)[key]
                  return (
                    <label key={key} style={{ display: 'block', marginBottom: 16 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                        <span>{label}</span>
                        <strong>{dials[key]} {unit}</strong>
                      </span>
                      <input
                        type="range" min={r.min} max={r.max} step={r.step} value={dials[key]}
                        onChange={(e) => setDials({ ...dials, [key]: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                      />
                    </label>
                  )
                })}
                <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setDials(optimalDials(cycle))}>
                  {t('field.reset')}
                </button>
              </div>
            )}

            {run && (
              <div style={{ ...card, borderLeft: `3px solid ${run.completed ? 'var(--color-accent)' : 'var(--color-alert)'}` }}>
                <div className="label-caps" style={{ marginBottom: 10 }}>{t('field.cycle')}</div>
                <p style={{ margin: '0 0 12px', fontSize: 15, color: run.completed ? 'var(--color-text)' : 'var(--color-alert)' }}>
                  {run.summary}
                </p>
                {hint && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{hint}</p>}

                <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
                  {run.stages.map((s, i) => (
                    <li key={s.id} style={{
                      display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13,
                      padding: '5px 0', borderTop: i ? '1px solid var(--color-border)' : 'none',
                      background: s.id === highlightStage ? 'var(--color-accent-subtle)' : 'transparent',
                      margin: s.id === highlightStage ? '0 -8px' : 0,
                      paddingLeft: s.id === highlightStage ? 8 : 0,
                      paddingRight: s.id === highlightStage ? 8 : 0,
                      borderRadius: s.id === highlightStage ? 6 : 0,
                    }}>
                      <span style={{ color: 'var(--color-text-disabled)', fontVariantNumeric: 'tabular-nums' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ flex: 1 }}>{s.label}</span>
                      <span style={{
                        color: s.outcome === 'passed' ? 'var(--color-accent)'
                          : s.outcome === 'not_reached' ? 'var(--color-text-disabled)'
                          : 'var(--color-alert)',
                      }}>
                        {t(`outcome.${s.outcome}`)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {cycle?.interventions?.length > 0 && (
              <div style={card}>
                <div className="label-caps" style={{ marginBottom: 10 }}>{t('field.breakIt')}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {cycle.interventions.slice(0, 4).map((iv) => (
                    <li key={iv.action} style={{ fontSize: 13, marginBottom: 12 }}>
                      <div style={{ color: 'var(--color-text)' }}>{iv.action}</div>
                      <div style={{ color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {stageLabels[iv.stage_id] ?? iv.stage_id} — {t(`effect.${iv.effect}`)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
