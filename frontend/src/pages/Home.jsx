import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'

import { useLang } from '../context/LanguageContext'

const stats = [
  { value: '38', label: 'home.stat.classes', sub: 'home.stat.classesSub' },
  { value: '14', label: 'home.stat.cycles', sub: 'home.stat.cyclesSub' },
  { value: 'VR', label: 'home.stat.field', sub: 'home.stat.fieldSub' },
  { value: '5', label: 'home.stat.langs', sub: 'home.stat.langsSub' },
]

const steps = [
  { num: '01', icon: '📷', title: 'home.step1.title', desc: 'home.step1.desc' },
  { num: '02', icon: '🧠', title: 'home.step2.title', desc: 'home.step2.desc' },
  { num: '03', icon: '💊', title: 'home.step3.title', desc: 'home.step3.desc' },
]

// Keyed by the plant names in data/disease_info.json, which crop.* translates.
const crops = [
  ['🍎', 'Apple'], ['🍅', 'Tomato'], ['🥔', 'Potato'], ['🌽', 'Corn (Maize)'],
  ['🍇', 'Grape'], ['🫑', 'Bell Pepper'], ['🍑', 'Peach'], ['🍊', 'Orange'],
  ['🫐', 'Blueberry'], ['🍓', 'Strawberry'], ['🍒', 'Cherry'], ['🍃', 'Raspberry'],
  ['🌱', 'Soybean'], ['🎃', 'Squash'],
]

export default function Home() {
  const { t } = useLang()
  const revealRef = useRef([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.12 }
    )
    revealRef.current.forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const addReveal = (el, i) => { revealRef.current[i] = el }

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero-mesh" style={{ minHeight: '88vh', display: 'flex', alignItems: 'center' }}>
        {/* Decorative circle — breaks the grid */}
        <div style={{
          position: 'absolute',
          right: '-80px',
          top: '50%',
          transform: 'translateY(-50%) rotate(-12deg)',
          width: 500,
          height: 500,
          borderRadius: '40% 60% 55% 45% / 50% 45% 55% 50%',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          right: 40,
          top: '20%',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }} />

        <div className="px-4 py-16 sm:px-6 sm:py-20" style={{ maxWidth: 1100, margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div className="anim-fade-up" style={{ marginBottom: 24 }}>
            <span className="badge-ai">
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: 'var(--color-ai)', animation: 'pulse 2s infinite',
              }} />
              {t('home.badge')}
            </span>
          </div>

          <div style={{ maxWidth: 680 }}>
            <h1
              className="anim-fade-up anim-delay-1"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2.4rem, 6vw, 5rem)',
                fontWeight: 800,
                color: '#fff',
                lineHeight: 1.12,
                marginBottom: 24,
                letterSpacing: '-0.02em',
              }}
            >
              {t('home.titleA')}<br />
              <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.75)' }}>{t('home.titleEm')}</em>{' '}
              {t('home.titleB')}
            </h1>

            <p
              className="anim-fade-up anim-delay-2"
              style={{
                color: 'rgba(255,255,255,0.72)',
                fontSize: '1.1rem',
                lineHeight: 1.7,
                marginBottom: 36,
                maxWidth: 520,
              }}
            >
              {t('home.lead')}
            </p>

            <div className="anim-fade-up anim-delay-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/detect" className="btn-white">
                🔍 {t('home.ctaDetect')}
              </Link>
              <Link to="/about" className="btn-ghost-white">
                {t('home.ctaHow')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats row ─────────────────────────────────────── */}
      <section style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        {/* gap-px over a border-coloured background draws the dividers, so they
            stay right whether the grid has two columns or four. */}
        <div
          className="mx-auto grid max-w-[1100px] grid-cols-2 gap-px md:grid-cols-4"
          style={{ background: 'var(--color-border)' }}
        >
          {stats.map(({ value, label, sub }, i) => (
            <div
              key={label}
              className="px-4 py-6 sm:px-6 sm:py-8"
              style={{ background: 'var(--color-surface)', textAlign: 'center' }}
            >
              {/* The reveal is on the content, not the cell: a cell at opacity 0
                  would expose the border-coloured grid behind it as a solid block. */}
              <div ref={el => addReveal(el, i)} className="reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '2.1rem',
                fontWeight: 500,
                color: 'var(--color-accent)',
                lineHeight: 1,
                marginBottom: 6,
              }}>{value}</div>
              <div style={{
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'var(--color-text)',
                marginBottom: 3,
              }}>{t(label)}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t(sub)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="px-4 sm:px-6" style={{ paddingTop: 'var(--space-3xl)', paddingBottom: 'var(--space-3xl)', position: 'relative', overflow: 'hidden' }}>
        {/* Dot-grid decoration */}
        <div className="dot-grid" style={{
          position: 'absolute', right: -60, top: 40,
          width: 280, height: 280, opacity: 0.45, pointerEvents: 'none',
          borderRadius: 20,
        }} />

        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div ref={el => addReveal(el, 10)} className="reveal" style={{ marginBottom: 56 }}>
            <div className="label-caps" style={{ marginBottom: 12 }}>{t('home.processLabel')}</div>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', marginBottom: 0 }}>
              {t('home.processTitle')}
            </h2>
          </div>

          <div className="relative grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Connector line, only where the cards sit side by side */}
            <div className="hidden md:block" style={{
              position: 'absolute',
              top: 36,
              left: '16.5%',
              right: '16.5%',
              height: 1,
              background: 'linear-gradient(90deg, var(--color-border), var(--color-accent-subtle), var(--color-border))',
            }} />

            {steps.map(({ num, icon, title, desc }, i) => (
              <div
                key={num}
                ref={el => addReveal(el, 11 + i)}
                className={`reveal card relative ${i === 1 ? 'md:translate-y-5' : ''}`}
                style={{ transitionDelay: `${i * 0.12}s` }}
              >
                {/* Step number */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 20,
                }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    letterSpacing: '0.1em',
                    color: 'var(--color-accent)',
                    background: 'var(--color-accent-subtle)',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontWeight: 500,
                  }}>{num}</div>
                  <div style={{ fontSize: '1.6rem' }} aria-hidden="true">{icon}</div>
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  marginBottom: 10,
                  color: 'var(--color-text)',
                }}>{t(title)}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>{t(desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported Crops ───────────────────────────────── */}
      <section className="px-4 sm:px-6" style={{
        background: 'var(--color-surface-raised)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        paddingTop: 'var(--space-2xl)',
        paddingBottom: 'var(--space-2xl)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div
            ref={el => addReveal(el, 20)}
            className="reveal"
            style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36, flexWrap: 'wrap', gap: 16 }}
          >
            <div>
              <div className="label-caps" style={{ marginBottom: 8 }}>{t('home.coverage')}</div>
              <h2 style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2.2rem)', margin: 0 }}>{t('home.cropsTitle')}</h2>
            </div>
            <Link to="/detect" className="btn-primary">{t('home.startDetecting')} →</Link>
          </div>

          <div
            ref={el => addReveal(el, 21)}
            className="reveal"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
          >
            {crops.map(([icon, plant]) => (
              <span
                key={plant}
                style={{
                  padding: '8px 18px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 999,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--color-text)',
                  boxShadow: '0 1px 4px rgba(30,26,20,0.05)',
                }}
              ><span aria-hidden="true">{icon}</span> {t(`crop.${plant}`)}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="px-4 sm:px-6" style={{ paddingTop: 'var(--space-3xl)', paddingBottom: 'var(--space-3xl)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <div
            ref={el => addReveal(el, 30)}
            className="reveal"
          >
            {/* Decorative rule above */}
            <div style={{
              width: 48,
              height: 3,
              background: 'var(--color-accent)',
              borderRadius: 99,
              margin: '0 auto 28px',
            }} />
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', marginBottom: 16 }}>
              {t('home.ctaTitle')}
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem', marginBottom: 32 }}>
              {t('home.ctaLead')}
            </p>
            <Link to="/detect" className="btn-primary" style={{ fontSize: '1rem', padding: '14px 36px' }}>
              🌿 {t('home.getStarted')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
