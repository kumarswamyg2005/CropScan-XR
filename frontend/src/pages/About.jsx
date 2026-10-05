import { useEffect, useRef, useState } from 'react'

import { api } from '../lib/api'
import { useLang } from '../context/LanguageContext'
import { LANGS } from '../i18n'

// Keyed by the plant names in data/disease_info.json.
const crops = [
  { name: 'Apple', diseases: 3 },
  { name: 'Blueberry', diseases: 0 },
  { name: 'Cherry', diseases: 1 },
  { name: 'Corn (Maize)', diseases: 3 },
  { name: 'Grape', diseases: 3 },
  { name: 'Orange', diseases: 1 },
  { name: 'Peach', diseases: 1 },
  { name: 'Bell Pepper', diseases: 1 },
  { name: 'Potato', diseases: 2 },
  { name: 'Raspberry', diseases: 0 },
  { name: 'Soybean', diseases: 0 },
  { name: 'Squash', diseases: 1 },
  { name: 'Strawberry', diseases: 1 },
  { name: 'Tomato', diseases: 9 },
]

const phases = [
  { phase: 'about.phase1', title: 'about.phase1.title', desc: 'about.phase1.desc', color: 'var(--color-ai)', bg: 'var(--color-ai-subtle)' },
  { phase: 'about.phase2', title: 'about.phase2.title', desc: 'about.phase2.desc', color: 'var(--color-accent)', bg: 'var(--color-accent-subtle)' },
]

const pct = (x) => `${(x * 100).toFixed(1)}%`

function SectionTitle({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', margin: 0, textAlign: 'center' }}>
        {children}
      </h2>
      <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
    </div>
  )
}

function Metric({ label, value, highlight }) {
  return (
    <div style={{
      background: highlight ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
      border: `1px solid ${highlight ? 'rgba(45,106,79,0.25)' : 'var(--color-border)'}`,
      borderRadius: 14,
      padding: '16px 18px',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '1.6rem',
        color: highlight ? 'var(--color-accent-hover)' : 'var(--color-text)',
        lineHeight: 1.1,
        marginBottom: 6,
      }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{label}</div>
    </div>
  )
}

/**
 * The deployed model's measured numbers, read from /api/model (its meta.json)
 * so this page cannot drift from what is actually serving scans.
 */
function ModelMetrics() {
  const { t } = useLang()
  const [card, setCard] = useState(undefined) // undefined: loading, null: unreachable

  useEffect(() => {
    let alive = true
    api.model()
      .then((c) => alive && setCard(c))
      .catch(() => alive && setCard(null))
    return () => { alive = false }
  }, [])

  const note = (text) => (
    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>{text}</p>
  )
  if (card === undefined) return note(t('about.loadingModel'))
  if (card === null) return note(t('about.unreachable'))
  if (!card.available) return note(t('about.noModel'))

  const m = card.metrics ?? {}
  const show = (x, fmt) => (x == null ? t('about.notMeasured') : fmt(x))
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric highlight label={t('about.metric.field')} value={show(m.field_acc, pct)} />
        <Metric label={t('about.metric.lab')} value={show(m.lab_acc, pct)} />
        <Metric label={t('about.metric.gap')} value={show(m.domain_gap, (x) => `${(x * 100).toFixed(1)} pp`)} />
        <Metric label={t('about.metric.f1')} value={show(m.macro_f1_field, (x) => x.toFixed(3))} />
        <Metric label={t('about.metric.ece')} value={show(m.ece, (x) => x.toFixed(3))} />
      </div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', lineHeight: 1.7, margin: '16px 0 0' }}>
        {t('about.metricsNote')}
      </p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-disabled)', margin: '10px 0 0' }}>
        {card.model_version}{card.trained_at ? ` · ${card.trained_at.slice(0, 10)}` : ''}
      </p>
    </>
  )
}

export default function About() {
  const { t } = useLang()
  const revealRef = useRef([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.1 }
    )
    revealRef.current.forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const techStack = [
    ['about.tech.model', 'EfficientNet-B0 (ImageNet → PlantVillage + PlantDoc)'],
    ['about.tech.dataset', t('about.tech.datasetValue')],
    ['about.tech.training', t('about.tech.trainingValue')],
    ['about.tech.abstain', t('about.tech.abstainValue')],
    ['about.tech.backend', 'FastAPI + ONNX Runtime'],
    ['about.tech.frontend', 'React 18 + Vite + Tailwind CSS · three.js + WebXR'],
    ['about.tech.languages', LANGS.map((l) => l.name).join(' · ')],
  ]

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div className="px-4 sm:px-6" style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        paddingTop: 48,
        paddingBottom: 40,
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="label-caps anim-fade-up" style={{ marginBottom: 12 }}>{t('about.label')}</div>
          <h1 className="anim-fade-up anim-delay-1" style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            marginBottom: 14,
          }}>{t('about.title')}</h1>
          <p className="anim-fade-up anim-delay-2" style={{
            color: 'var(--color-text-muted)',
            fontSize: '1.05rem',
            maxWidth: 580,
            lineHeight: 1.7,
            margin: 0,
          }}>
            {t('about.lead')}
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6" style={{ maxWidth: 860, margin: '0 auto', paddingTop: 40, paddingBottom: 72 }}>

        {/* Measured performance */}
        <section style={{ marginBottom: 40 }}>
          <SectionTitle>{t('about.metricsTitle')}</SectionTitle>
          <ModelMetrics />
        </section>

        {/* How the model works */}
        <section
          ref={el => revealRef.current[0] = el}
          className="reveal"
          style={{ marginBottom: 32 }}
        >
          <SectionTitle>{t('about.howTitle')}</SectionTitle>

          <p style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.9rem',
            lineHeight: 1.7,
            marginBottom: 20,
          }}>
            {t('about.howBody')}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {phases.map(({ phase, title, desc, color, bg }) => (
              <div key={phase} style={{
                background: bg,
                border: `1px solid ${color}30`,
                borderRadius: 16,
                padding: '20px 22px',
                borderLeft: `3px solid ${color}`,
              }}>
                <div className="label-caps" style={{ color, marginBottom: 6 }}>{t(phase)}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10, color: 'var(--color-text)' }}>{t(title)}</div>
                <p style={{ fontSize: '0.83rem', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>{t(desc)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Technical Details */}
        <section
          ref={el => revealRef.current[1] = el}
          className="reveal"
          style={{ marginBottom: 32 }}
        >
          <SectionTitle>{t('about.techTitle')}</SectionTitle>

          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            overflow: 'hidden',
          }}>
            {techStack.map(([label, value], i) => (
              <div
                key={label}
                className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:items-center sm:gap-4"
                style={{
                  padding: '14px 22px',
                  borderBottom: i < techStack.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}
              >
                <div className="label-caps">{t(label)}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Dataset */}
        <section
          ref={el => revealRef.current[2] = el}
          className="reveal"
          style={{ marginBottom: 32 }}
        >
          <SectionTitle>{t('about.datasetTitle')}</SectionTitle>

          <p style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.875rem',
            lineHeight: 1.7,
            marginBottom: 20,
          }}>
            {t('about.datasetBody')}
          </p>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {crops.map(({ name, diseases }) => (
              <div key={name} style={{
                padding: '14px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>{t(`crop.${name}`)}</div>
                <div style={{
                  fontSize: '0.72rem',
                  color: diseases === 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {diseases === 0
                    ? t('about.healthyOnly')
                    : diseases === 1 ? t('about.oneDisease') : t('about.nDiseases', { n: diseases })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Disclaimer */}
        <div
          ref={el => revealRef.current[3] = el}
          className="reveal"
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: 'var(--color-ai-subtle)',
            border: '1px solid rgba(212,134,11,0.2)',
            fontSize: '0.82rem',
            color: 'var(--color-text-muted)',
            lineHeight: 1.65,
          }}
        >
          <strong style={{ color: 'var(--color-ai)' }}>{t('common.disclaimerLabel')}</strong> {t('about.disclaimer')}
        </div>
      </div>
    </div>
  )
}
