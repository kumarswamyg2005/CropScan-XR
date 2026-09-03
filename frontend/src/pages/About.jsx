import { useEffect, useRef } from 'react'

const techStack = [
  { label: 'Model',     value: 'EfficientNet-B0 (transfer learning from ImageNet)' },
  { label: 'Dataset',   value: 'PlantVillage — 54,306 images, 38 classes' },
  { label: 'Training',  value: 'Phase 1: head-only 5 epochs → Phase 2: full fine-tune 15 epochs' },
  { label: 'Accuracy',  value: '99.3% test accuracy (99.4% validation)' },
  { label: 'Backend',   value: 'FastAPI + PyTorch (Python 3.11)' },
  { label: 'Frontend',  value: 'React 18 + Vite + Tailwind CSS' },
  { label: 'Inference', value: '< 1 second per image on CPU' },
]

const crops = [
  { name: 'Apple',       diseases: 3 },
  { name: 'Blueberry',   diseases: 0 },
  { name: 'Cherry',      diseases: 1 },
  { name: 'Corn',        diseases: 3 },
  { name: 'Grape',       diseases: 3 },
  { name: 'Orange',      diseases: 1 },
  { name: 'Peach',       diseases: 1 },
  { name: 'Bell Pepper', diseases: 1 },
  { name: 'Potato',      diseases: 2 },
  { name: 'Raspberry',   diseases: 0 },
  { name: 'Soybean',     diseases: 0 },
  { name: 'Squash',      diseases: 1 },
  { name: 'Strawberry',  diseases: 1 },
  { name: 'Tomato',      diseases: 9 },
]

const phases = [
  {
    phase: 'Phase 1',
    title: 'Warm-up (5 epochs)',
    desc: 'Only the classifier head is trained. The EfficientNet-B0 convolutional base is frozen — preserving ImageNet feature representations and preventing catastrophic forgetting.',
    color: 'var(--color-ai)',
    bg: 'var(--color-ai-subtle)',
  },
  {
    phase: 'Phase 2',
    title: 'Full Fine-tune (15 epochs)',
    desc: 'All layers are unfrozen and trained at a low learning rate (1e-4) with cosine annealing. This adapts the base features to plant leaf textures at a microscopic level.',
    color: 'var(--color-accent)',
    bg: 'var(--color-accent-subtle)',
  },
]

export default function About() {
  const revealRef = useRef([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.1 }
    )
    revealRef.current.forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '48px 24px 40px',
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="label-caps anim-fade-up" style={{ marginBottom: 12 }}>Under the Hood</div>
          <h1 className="anim-fade-up anim-delay-1" style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            marginBottom: 14,
          }}>About CropScan</h1>
          <p className="anim-fade-up anim-delay-2" style={{
            color: 'var(--color-text-muted)',
            fontSize: '1.05rem',
            maxWidth: 580,
            lineHeight: 1.7,
            margin: 0,
          }}>
            An end-to-end deep learning pipeline for plant disease detection —
            trained on 54K images, achieving 99.3% accuracy across 38 disease classes.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 72px' }}>

        {/* How the model works */}
        <section
          ref={el => revealRef.current[0] = el}
          className="reveal"
          style={{ marginBottom: 32 }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
          }}>
            <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
            <h2 style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '1.4rem',
              margin: 0,
              whiteSpace: 'nowrap',
            }}>How the Model Works</h2>
            <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
          </div>

          <p style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.9rem',
            lineHeight: 1.7,
            marginBottom: 20,
          }}>
            The model is an <strong style={{ color: 'var(--color-text)' }}>EfficientNet-B0</strong> convolutional
            neural network pre-trained on ImageNet and fine-tuned on the PlantVillage dataset using a two-phase
            transfer learning strategy. Images are resized to 224×224 and normalized using ImageNet statistics.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {phases.map(({ phase, title, desc, color, bg }) => (
              <div key={phase} style={{
                background: bg,
                border: `1px solid ${color}30`,
                borderRadius: 16,
                padding: '20px 22px',
                borderLeft: `3px solid ${color}`,
              }}>
                <div style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '0.68rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color,
                  marginBottom: 6,
                  fontWeight: 500,
                }}>{phase}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10, color: 'var(--color-text)' }}>{title}</div>
                <p style={{ fontSize: '0.83rem', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>{desc}</p>
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
          }}>
            <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
            <h2 style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '1.4rem',
              margin: 0,
              whiteSpace: 'nowrap',
            }}>Technical Details</h2>
            <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
          </div>

          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            overflow: 'hidden',
          }}>
            {techStack.map(({ label, value }, i) => (
              <div key={label} style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr',
                gap: 16,
                padding: '14px 22px',
                borderBottom: i < techStack.length - 1 ? '1px solid var(--color-border)' : 'none',
                alignItems: 'center',
              }}>
                <div className="label-caps">{label}</div>
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
          }}>
            <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
            <h2 style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '1.4rem',
              margin: 0,
              whiteSpace: 'nowrap',
            }}>Dataset — PlantVillage</h2>
            <div style={{ height: 1, flex: 1, background: 'var(--color-border)' }} />
          </div>

          <p style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.875rem',
            lineHeight: 1.7,
            marginBottom: 20,
          }}>
            PlantVillage is a publicly available dataset of 54,306 leaf images collected under controlled conditions,
            covering 14 crops and 38 distinct disease classes. The <strong>color variant</strong> was used for best accuracy.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {crops.map(({ name, diseases }) => (
              <div key={name} style={{
                padding: '14px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>{name}</div>
                <div style={{
                  fontSize: '0.72rem',
                  color: diseases === 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  fontFamily: '"DM Mono", monospace',
                }}>
                  {diseases === 0 ? 'Healthy only' : `${diseases} disease${diseases > 1 ? 's' : ''}`}
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
          <strong style={{ color: 'var(--color-ai)' }}>Disclaimer:</strong> This tool is intended for educational
          and research purposes only. Always consult a certified agronomist or plant pathologist for professional
          crop disease diagnosis and treatment decisions.
        </div>
      </div>
    </div>
  )
}
