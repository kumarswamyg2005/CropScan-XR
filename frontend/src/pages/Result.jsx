import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useLang } from '../context/LanguageContext'

function ConfidenceBar({ value }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 100)
    return () => clearTimeout(t)
  }, [value])

  const color = value >= 80
    ? 'var(--color-accent)'
    : value >= 50
      ? 'var(--color-ai)'
      : 'var(--color-alert)'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span className="label-caps">Confidence</span>
        <span style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: '1.5rem',
          fontWeight: 500,
          color,
          lineHeight: 1,
        }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{
        height: 8,
        background: 'var(--color-surface-raised)',
        borderRadius: 999,
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{
          height: '100%',
          width: `${width}%`,
          background: color,
          borderRadius: 999,
          transition: 'width 1.1s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: `0 0 12px ${color}55`,
        }} />
      </div>
    </div>
  )
}

function TreatmentCard({ icon, title, content, accentColor }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      padding: '20px 22px',
      borderLeft: `3px solid ${accentColor || 'var(--color-accent)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>{title}</span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>{content}</p>
    </div>
  )
}

export default function Result() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { lang } = useLang()

  if (!state?.result) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🌿</div>
        <h2 style={{ fontFamily: '"Playfair Display", serif', marginBottom: 12 }}>No result found</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 28 }}>Run a detection first to see results here.</p>
        <Link to="/detect" className="btn-primary">Go to Detect</Link>
      </div>
    )
  }

  const { result, imageUrl } = state
  const { class_name, confidence, top3, disease_info, disease_info_te } = result

  // Pick correct language data — fall back to English if Telugu missing
  const info = (lang === 'te' && disease_info_te && Object.keys(disease_info_te).length > 0)
    ? { ...disease_info, ...disease_info_te }
    : disease_info

  const isHealthy = disease_info?.is_healthy ?? class_name.includes('healthy')
  const displayName = info?.name || class_name.replace(/___/g, ' — ').replace(/_/g, ' ')
  const plantName = disease_info?.plant || class_name.split('___')[0].replace(/_/g, ' ')

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--color-bg)' }}>
      {/* Result header strip */}
      <div style={{
        background: isHealthy
          ? 'linear-gradient(135deg, #2D6A4F, #1B4332)'
          : 'linear-gradient(135deg, #8B3120, #B84C30)',
        padding: '36px 24px 32px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Noise overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: 860, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div className="anim-fade-up" style={{ marginBottom: 10 }}>
            {isHealthy
              ? <span className="badge-healthy">✓ Healthy Plant</span>
              : <span className="badge-alert">⚠ Disease Detected</span>
            }
          </div>
          <h1 className="anim-fade-up anim-delay-1" style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
            color: '#fff',
            margin: '10px 0 6px',
          }}>{displayName}</h1>
          <p className="anim-fade-up anim-delay-2" style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: 0 }}>
            Plant: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{plantName}</strong>
            {disease_info?.severity && (
              <> &nbsp;·&nbsp; {lang === 'te' ? 'తీవ్రత' : 'Severity'}: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                {disease_info.severity.charAt(0).toUpperCase() + disease_info.severity.slice(1)}
              </strong></>
            )}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Image + confidence grid */}
        <div className="anim-fade-up anim-delay-2" style={{
          display: 'grid',
          gridTemplateColumns: imageUrl ? '1fr 1fr' : '1fr',
          gap: 20,
          marginBottom: 28,
        }}>
          {imageUrl && (
            <div style={{
              borderRadius: 20,
              overflow: 'hidden',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised)',
              aspectRatio: '4/3',
            }}>
              <img src={imageUrl} alt="Analysed leaf" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 20,
          }}>
            <ConfidenceBar value={confidence} />

            {top3?.length > 1 && (
              <div>
                <div className="label-caps" style={{ marginBottom: 12 }}>{lang === 'te' ? 'అగ్ర అంచనాలు' : 'Top Predictions'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {top3.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: i === 0 ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)',
                      border: `1px solid ${i === 0 ? 'rgba(45,106,79,0.2)' : 'var(--color-border)'}`,
                    }}>
                      <span style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '0.68rem',
                        color: i === 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
                        fontWeight: 500,
                        minWidth: 24,
                      }}>#{i + 1}</span>
                      <span style={{
                        flex: 1,
                        fontSize: '0.82rem',
                        fontWeight: i === 0 ? 600 : 400,
                        color: i === 0 ? 'var(--color-accent-hover)' : 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {p.class_name.split('___').pop().replace(/_/g, ' ')}
                      </span>
                      <span style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: i === 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
                        flexShrink: 0,
                      }}>{p.confidence.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Healthy result */}
        {isHealthy ? (
          <div className="anim-fade-up anim-delay-3" style={{
            background: 'var(--color-accent-subtle)',
            border: '1px solid rgba(45,106,79,0.2)',
            borderRadius: 20,
            padding: '36px',
            textAlign: 'center',
            marginBottom: 28,
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🌱</div>
            <h2 style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '1.5rem',
              color: 'var(--color-accent-hover)',
              marginBottom: 8,
            }}>{lang === 'te' ? 'మీ మొక్క ఆరోగ్యంగా ఉంది!' : 'Your plant looks healthy!'}</h2>
            <p style={{ color: 'var(--color-accent)', fontSize: '0.9rem', margin: 0 }}>
              {lang === 'te' ? 'వ్యాధి గుర్తించబడలేదు. మంచి సంరక్షణ పద్ధతులు కొనసాగించండి.' : 'No disease detected. Keep up good care practices.'}
            </p>
            {info?.prevention && (
              <p style={{ color: 'var(--color-accent)', fontSize: '0.875rem', marginTop: 12, opacity: 0.85 }}>
                <strong>{lang === 'te' ? 'నివారణ చిట్కా:' : 'Prevention tip:'}</strong> {info.prevention}
              </p>
            )}
          </div>
        ) : (
          <div className="anim-fade-up anim-delay-3">
            {/* Symptoms */}
            {info?.symptoms && (
              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 16,
                padding: '20px 22px',
                marginBottom: 16,
                borderLeft: '3px solid var(--color-ai)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>🔬</span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lang === 'te' ? 'లక్షణాలు' : 'Symptoms'}</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>
                  {info.symptoms}
                </p>
              </div>
            )}

            {/* Treatment cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              {info?.organic && (
                <TreatmentCard icon="🌿" title={lang === 'te' ? 'సేంద్రీయ చికిత్స' : 'Organic Treatment'} content={info.organic} accentColor="var(--color-accent)" />
              )}
              {info?.chemical && (
                <TreatmentCard icon="⚗️" title={lang === 'te' ? 'రసాయన చికిత్స' : 'Chemical Treatment'} content={info.chemical} accentColor="var(--color-ai)" />
              )}
            </div>

            {info?.prevention && (
              <TreatmentCard icon="🛡️" title={lang === 'te' ? 'నివారణ' : 'Prevention'} content={info.prevention} accentColor="var(--color-text-muted)" />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="anim-fade-up anim-delay-4" style={{
          display: 'flex',
          gap: 12,
          marginTop: 32,
          flexWrap: 'wrap',
        }}>
          <button onClick={() => navigate('/detect')} className="btn-primary">
            🔍 {lang === 'te' ? 'మళ్ళీ గుర్తించండి' : 'Detect Another'}
          </button>
          <Link to="/" className="btn-secondary">← {lang === 'te' ? 'హోమ్‌కి వెళ్ళండి' : 'Back to Home'}</Link>
        </div>

        {/* Disclaimer */}
        <div style={{
          marginTop: 32,
          padding: '14px 18px',
          borderRadius: 10,
          background: 'var(--color-ai-subtle)',
          border: '1px solid rgba(212,134,11,0.18)',
          fontSize: '0.78rem',
          color: 'var(--color-text-muted)',
        }}>
          <strong style={{ color: 'var(--color-ai)' }}>Disclaimer:</strong> This is an AI-powered tool for educational use.
          Always consult a certified agronomist for professional diagnosis and treatment decisions.
        </div>
      </div>
    </div>
  )
}
