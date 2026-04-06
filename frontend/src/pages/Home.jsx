import { Link } from 'react-router-dom'
import { useEffect, useRef } from 'react'

const stats = [
  { value: '54K+', label: 'Training Images', sub: 'PlantVillage dataset' },
  { value: '38',   label: 'Disease Classes', sub: 'Across 14 crops' },
  { value: '99.3%',label: 'Test Accuracy',   sub: 'EfficientNet-B0' },
  { value: '<1s',  label: 'Inference Time',  sub: 'Per image, on CPU' },
]

const steps = [
  {
    num: '01',
    icon: '📷',
    title: 'Upload a Leaf Photo',
    desc: 'Drag & drop or click to select. Works with JPG, PNG, or WEBP. Use a well-lit, clear photo of a single leaf.',
  },
  {
    num: '02',
    icon: '🧠',
    title: 'AI Analyses Instantly',
    desc: 'EfficientNet-B0 scans the image against 38 disease classes trained on 54,000+ real leaf images.',
  },
  {
    num: '03',
    icon: '💊',
    title: 'Get Treatment Advice',
    desc: 'Receive a full diagnosis — symptoms, organic & chemical treatments, and prevention tips.',
  },
]

const crops = [
  '🍎 Apple', '🍅 Tomato', '🥔 Potato', '🌽 Corn',
  '🍇 Grape', '🫑 Pepper', '🍑 Peach', '🍊 Orange',
  '🫐 Blueberry', '🍓 Strawberry', '🌱 Soybean', '🫒 Squash',
]

export default function Home() {
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

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div className="anim-fade-up" style={{ marginBottom: 24 }}>
            <span className="badge-ai">
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: 'var(--color-ai)', animation: 'pulse 2s infinite',
              }} />
              AI-Powered · EfficientNet-B0
            </span>
          </div>

          {/* Heading — asymmetric layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', maxWidth: 680 }}>
            <h1
              className="anim-fade-up anim-delay-1"
              style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: 'clamp(2.8rem, 6vw, 5rem)',
                fontWeight: 800,
                color: '#fff',
                lineHeight: 1.08,
                marginBottom: 24,
                letterSpacing: '-0.02em',
              }}
            >
              Detect Crop<br />
              <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.75)' }}>Diseases</em>{' '}
              Instantly.
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
              Upload a leaf photo and get an AI diagnosis in under a second —
              covering 38 disease classes across 14 crops, with full treatment recommendations.
            </p>

            <div className="anim-fade-up anim-delay-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/detect" className="btn-white">
                🔍 Detect Disease
              </Link>
              <Link to="/about" className="btn-ghost-white">
                How it works
              </Link>
            </div>
          </div>

          {/* Floating accuracy badge — grid break */}
          <div
            className="anim-fade-up anim-delay-4"
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'absolute',
              right: 80,
              bottom: 60,
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 16,
              padding: '16px 24px',
              textAlign: 'center',
            }}
          >
            <span style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '2rem',
              fontWeight: 500,
              color: '#fff',
              lineHeight: 1,
            }}>99.3%</span>
            <span style={{
              fontFamily: '"DM Sans", sans-serif',
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)',
              marginTop: 4,
            }}>Test Accuracy</span>
          </div>
        </div>
      </section>

      {/* ── Stats row ─────────────────────────────────────── */}
      <section style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
        }}>
          {stats.map(({ value, label, sub }, i) => (
            <div
              key={label}
              ref={el => addReveal(el, i)}
              className="reveal"
              style={{
                padding: '32px 24px',
                borderRight: i < 3 ? '1px solid var(--color-border)' : 'none',
                textAlign: 'center',
                transitionDelay: `${i * 0.08}s`,
              }}
            >
              <div style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '2.1rem',
                fontWeight: 500,
                color: 'var(--color-accent)',
                lineHeight: 1,
                marginBottom: 6,
              }}>{value}</div>
              <div style={{
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'var(--color-text)',
                marginBottom: 3,
              }}>{label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section style={{ padding: 'var(--space-3xl) 24px', position: 'relative', overflow: 'hidden' }}>
        {/* Dot-grid decoration */}
        <div className="dot-grid" style={{
          position: 'absolute', right: -60, top: 40,
          width: 280, height: 280, opacity: 0.45, pointerEvents: 'none',
          borderRadius: 20,
        }} />

        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div ref={el => addReveal(el, 10)} className="reveal" style={{ marginBottom: 56 }}>
            <div className="label-caps" style={{ marginBottom: 12 }}>The Process</div>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', marginBottom: 0 }}>
              Three steps to diagnosis
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, position: 'relative' }}>
            {/* Connector line */}
            <div style={{
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
                className="reveal card"
                style={{
                  transitionDelay: `${i * 0.12}s`,
                  position: 'relative',
                  transform: i === 1 ? 'translateY(20px)' : 'none', // break the grid
                }}
              >
                {/* Step number */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 20,
                }}>
                  <div style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '0.7rem',
                    letterSpacing: '0.1em',
                    color: 'var(--color-accent)',
                    background: 'var(--color-accent-subtle)',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontWeight: 500,
                  }}>{num}</div>
                  <div style={{ fontSize: '1.6rem' }}>{icon}</div>
                </div>
                <h3 style={{
                  fontFamily: '"Playfair Display", serif',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  marginBottom: 10,
                  color: 'var(--color-text)',
                }}>{title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported Crops ───────────────────────────────── */}
      <section style={{
        background: 'var(--color-surface-raised)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        padding: 'var(--space-2xl) 24px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div
            ref={el => addReveal(el, 20)}
            className="reveal"
            style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36, flexWrap: 'wrap', gap: 16 }}
          >
            <div>
              <div className="label-caps" style={{ marginBottom: 8 }}>Coverage</div>
              <h2 style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2.2rem)', margin: 0 }}>Supported Crops</h2>
            </div>
            <Link to="/detect" className="btn-primary">Start Detecting →</Link>
          </div>

          <div
            ref={el => addReveal(el, 21)}
            className="reveal"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
          >
            {crops.map((crop) => (
              <span
                key={crop}
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
              >{crop}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section style={{ padding: 'var(--space-3xl) 24px' }}>
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
              Ready to diagnose your crop?
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem', marginBottom: 32 }}>
              Upload a leaf photo and get an AI-powered diagnosis in under a second — completely free.
            </p>
            <Link to="/detect" className="btn-primary" style={{ fontSize: '1rem', padding: '14px 36px' }}>
              🌿 Get Started
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
