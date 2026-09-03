import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api } from '../lib/api'
import { useLang } from '../context/LanguageContext'
import { dialRanges, optimalDials, runCycle, suggestBreak } from '../field/cycleMachine'

// The one lazy route. three.js and the XR stack live behind this import so the
// rest of the site never downloads them.
const FieldScene = lazy(() => import('../field/FieldScene'))

const T = {
  title: { en: 'Field module', te: 'క్షేత్ర మాడ్యూల్' },
  intro: {
    en: 'Watch the disease in a real field, in 360°. The infection cycle runs alongside the footage — change one condition and watch it stall.',
    te: '360° లో నిజమైన పొలంలో వ్యాధిని చూడండి. ఫుటేజ్‌తో పాటు సంక్రమణ చక్రం నడుస్తుంది — ఒక పరిస్థితిని మార్చి అది ఆగిపోవడం చూడండి.',
  },
  enterVR: { en: 'Enter in VR', te: 'VRలో ప్రవేశించండి' },
  noHeadset: { en: 'No headset detected — the 360° view still works here, drag to look around.', te: 'హెడ్‌సెట్ కనిపించలేదు — 360° వీక్షణ ఇక్కడ పనిచేస్తుంది, చుట్టూ చూడటానికి లాగండి.' },
  play: { en: 'Play', te: 'ప్లే' },
  pause: { en: 'Pause', te: 'ఆపు' },
  clips: { en: 'Footage', te: 'ఫుటేజ్' },
  environment: { en: 'Environment', te: 'వాతావరణం' },
  temperature: { en: 'Temperature', te: 'ఉష్ణోగ్రత' },
  wetness: { en: 'Leaf wetness', te: 'ఆకు తడి' },
  humidity: { en: 'Humidity', te: 'తేమ' },
  reset: { en: 'Reset to ideal', te: 'ఆదర్శానికి రీసెట్' },
  cycle: { en: 'Infection cycle', te: 'సంక్రమణ చక్రం' },
  breakIt: { en: 'Where to break it', te: 'ఎక్కడ ఆపాలి' },
  noVideo: { en: 'No footage has been published for this disease yet. The cycle still runs.', te: 'ఈ వ్యాధికి ఫుటేజ్ ఇంకా ప్రచురించబడలేదు. చక్రం ఇంకా నడుస్తుంది.' },
  pick: { en: 'Pick a disease to enter the field.', te: 'క్షేత్రంలోకి వెళ్లడానికి ఒక వ్యాధిని ఎంచుకోండి.' },
}

function useXrSupport() {
  const [supported, setSupported] = useState(null)
  useEffect(() => {
    if (!navigator.xr) return setSupported(false)
    let alive = true
    navigator.xr
      .isSessionSupported('immersive-vr')
      .then((ok) => alive && setSupported(ok))
      .catch(() => alive && setSupported(false))
    return () => { alive = false }
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
  const { lang } = useLang()
  const [params] = useSearchParams()
  const xrSupported = useXrSupport()

  const scanId = params.get('scan')
  const diseaseParam = params.get('disease')

  const [diseaseId, setDiseaseId] = useState(diseaseParam)
  const [cycle, setCycle] = useState(null)
  const [videos, setVideos] = useState([])
  const [videoIndex, setVideoIndex] = useState(0)
  const [choices, setChoices] = useState([])
  const [dials, setDials] = useState(null)
  const [playing, setPlaying] = useState(true)
  const [strategy, setStrategy] = useState('video-texture')
  const [blocked, setBlocked] = useState(null)
  const t = (k) => T[k][lang]

  // A scan the server refuses to let into the field cannot get in here either.
  useEffect(() => {
    if (!scanId) return
    api.getScan(scanId, lang).then((scan) => {
      if (!scan.canEnterField) setBlocked(scan.fieldBlockedReason)
      else setDiseaseId(scan.class_name)
    }).catch((e) => setBlocked(e.message))
  }, [scanId, lang])

  useEffect(() => {
    api.listDiseases({ hasCycle: true }).then(setChoices).catch(() => {})
  }, [])

  useEffect(() => {
    if (!diseaseId) return
    api.getCycle(diseaseId, lang).then((r) => {
      setCycle(r.cycle)
      if (r.cycle) setDials(optimalDials(r.cycle))
    }).catch(() => {})
    api.listVideos(diseaseId, lang).then((v) => { setVideos(v); setVideoIndex(0) }).catch(() => {})
  }, [diseaseId, lang])

  const run = useMemo(() => (cycle && dials ? runCycle(cycle, dials) : null), [cycle, dials])
  const hint = useMemo(() => (cycle && dials ? suggestBreak(cycle, dials) : null), [cycle, dials])
  const video = videos[videoIndex] ?? null

  if (blocked) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--space-2xl) var(--space-lg)' }}>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 34, marginBottom: 12 }}>{t('title')}</h1>
        <div style={{ ...card, borderLeft: '3px solid var(--color-alert)' }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{blocked}</p>
          <Link to="/detect" className="btn-secondary" style={{ marginTop: 16, display: 'inline-block' }}>
            Scan again
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'var(--space-xl) var(--space-lg) var(--space-3xl)' }}>
      <div className="label-caps" style={{ marginBottom: 8 }}>WebXR</div>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 38, margin: '0 0 8px' }}>{t('title')}</h1>
      <p style={{ color: 'var(--color-text-muted)', maxWidth: 620, marginBottom: 'var(--space-xl)' }}>{t('intro')}</p>

      {!diseaseId && (
        <div style={card}>
          <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>{t('pick')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {choices.map((d) => (
              <button key={d.id} onClick={() => setDiseaseId(d.id)} className="btn-secondary" style={{ fontSize: 14 }}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {diseaseId && (
        <div style={{ display: 'grid', gap: 'var(--space-lg)', gridTemplateColumns: 'minmax(0,1.55fr) minmax(280px,1fr)' }}>
          <div>
            <div style={{
              position: 'relative', aspectRatio: '16 / 10', borderRadius: 12, overflow: 'hidden',
              border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)',
            }}>
              <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--color-text-muted)' }}>Loading the field…</div>}>
                <FieldScene
                  video={video}
                  run={run}
                  playing={playing}
                  onStrategy={setStrategy}
                />
              </Suspense>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <button
                className="btn-primary"
                disabled={xrSupported !== true}
                onClick={() => import('../field/FieldScene').then((m) => m.xrStore.enterVR())}
                style={xrSupported !== true ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              >
                {t('enterVR')}
              </button>
              <button className="btn-secondary" onClick={() => setPlaying((p) => !p)} disabled={!video}>
                {playing ? t('pause') : t('play')}
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {video ? `${video.projection} · ${strategy}` : t('noVideo')}
              </span>
            </div>

            {xrSupported === false && (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 8 }}>{t('noHeadset')}</p>
            )}

            {videos.length > 1 && (
              <div style={{ marginTop: 18 }}>
                <div className="label-caps" style={{ marginBottom: 8 }}>{t('clips')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {videos.map((v, i) => (
                    <button
                      key={v.id}
                      onClick={() => setVideoIndex(i)}
                      className={i === videoIndex ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: 13 }}
                    >
                      {v.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            {cycle && dials && (
              <div style={card}>
                <div className="label-caps" style={{ marginBottom: 14 }}>{t('environment')}</div>
                {[
                  ['temp_c', t('temperature'), '°C'],
                  ['leaf_wetness_hr', t('wetness'), 'h'],
                  ['rh_pct', t('humidity'), '%'],
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
                  {t('reset')}
                </button>
              </div>
            )}

            {run && (
              <div style={{ ...card, borderLeft: `3px solid ${run.completed ? 'var(--color-accent)' : 'var(--color-alert)'}` }}>
                <div className="label-caps" style={{ marginBottom: 10 }}>{t('cycle')}</div>
                <p style={{ margin: '0 0 12px', fontSize: 15, color: run.completed ? 'var(--color-text)' : 'var(--color-alert)' }}>
                  {run.summary}
                </p>
                {hint && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{hint}</p>}

                <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
                  {run.stages.map((s, i) => (
                    <li key={s.id} style={{
                      display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13,
                      padding: '5px 0', borderTop: i ? '1px solid var(--color-border)' : 'none',
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
                        {s.outcome.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {cycle?.interventions?.length > 0 && (
              <div style={card}>
                <div className="label-caps" style={{ marginBottom: 10 }}>{t('breakIt')}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {cycle.interventions.slice(0, 4).map((iv) => (
                    <li key={iv.action} style={{ fontSize: 13, marginBottom: 12 }}>
                      <div style={{ color: 'var(--color-text)' }}>{iv.action}</div>
                      <div style={{ color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {iv.stage_id.replace(/_/g, ' ')} — {iv.effect.replace(/_/g, ' ')}
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
