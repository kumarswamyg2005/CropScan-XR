import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { api } from '../lib/api'
import { useLang } from '../context/LanguageContext'

const NOT_A_LEAF = 'Not_a_leaf'

function ConfidenceBar({ value, label }) {
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
        <span className="label-caps">{label}</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.5rem',
          fontWeight: 500,
          color,
          lineHeight: 1,
        }}>{value.toFixed(1)}%</span>
      </div>
      <div
        role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}
        style={{
          height: 8,
          background: 'var(--color-surface-raised)',
          borderRadius: 999,
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}
      >
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
        <span style={{ fontSize: '1.2rem' }} aria-hidden="true">{icon}</span>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>{title}</span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>{content}</p>
    </div>
  )
}

/** "Tomato___Early_blight" -> "Early blight", for a class the API did not name. */
const prettyClass = (id) => id.split('___').pop().replace(/_/g, ' ')

function TopPredictions({ top3, title }) {
  return (
    <div>
      <div className="label-caps" style={{ marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {top3.map((p, i) => (
          <div key={p.class_name} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 8,
            background: i === 0 ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)',
            border: `1px solid ${i === 0 ? 'rgba(45,106,79,0.2)' : 'var(--color-border)'}`,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
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
              {p.name ?? prettyClass(p.class_name)}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              fontWeight: 500,
              color: i === 0 ? 'var(--color-accent)' : 'var(--color-text-muted)',
              flexShrink: 0,
            }}>{p.confidence.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Message({ icon, title, body, children }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }} aria-hidden="true">{icon}</div>
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 12 }}>{title}</h2>
      {body && <p style={{ color: 'var(--color-text-muted)', marginBottom: 28 }}>{body}</p>}
      {children}
    </div>
  )
}

export default function Result() {
  const { state } = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { lang, t } = useLang()
  const [showAttention, setShowAttention] = useState(false)

  // Router state paints the page instantly after a scan. The id in the URL is
  // what survives a reload and a language switch.
  const scanId = params.get('scan') ?? state?.result?.id ?? null
  const [result, setResult] = useState(state?.result ?? null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    if (!scanId) return
    let alive = true
    setLoadError(null)
    api.getScan(scanId, lang)
      .then((r) => alive && setResult(r))
      .catch((e) => {
        console.error('[CropScan] scan fetch failed', e)
        if (alive) setLoadError(e)
      })
    return () => { alive = false }
  }, [scanId, lang])

  if (!result) {
    if (!scanId) {
      return (
        <Message icon="🌿" title={t('result.none.title')} body={t('result.none.body')}>
          <Link to="/detect" className="btn-primary">{t('result.none.cta')}</Link>
        </Message>
      )
    }
    if (loadError) {
      return (
        <Message
          icon="⚠️"
          title={loadError.status === 404 ? t('result.notFound') : t('result.loadFailed')}
        >
          <Link to="/detect" className="btn-primary">{t('result.none.cta')}</Link>
        </Message>
      )
    }
    return <Message icon="🌿" title={t('result.loading')} />
  }

  const imageUrl = state?.imageUrl ?? result.storedImageUrl
  const { class_name, confidence, top3, disease_info: info } = result
  const { gradcamUrl, canEnterField, hasCycle, status, modelVersion } = result
  const uncertain = status === 'uncertain'
  // The model's own "this is not a plant" answer (the Not_a_leaf class), when it has one
  const notLeaf = uncertain && top3?.[0]?.class_name === NOT_A_LEAF

  const isHealthy = !uncertain && (info?.is_healthy ?? class_name.includes('healthy'))
  const displayName = notLeaf ? t('result.notLeafTitle')
    : uncertain ? t('result.uncertainTitle') : (info?.name || prettyClass(class_name))
  const plant = info?.plant ?? class_name.split('___')[0].replace(/_/g, ' ')

  const blockedReason = uncertain
    ? t('result.blockedUncertain')
    : !hasCycle ? t('result.blockedNoCycle') : null

  const headerBg = uncertain
    ? 'linear-gradient(135deg, #8A6410, #B07D12)'
    : isHealthy
      ? 'linear-gradient(135deg, #2D6A4F, #1B4332)'
      : 'linear-gradient(135deg, #8B3120, #B84C30)'

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--color-bg)' }}>
      {/* Result header strip */}
      <div className="px-4 sm:px-6" style={{
        background: headerBg,
        paddingTop: 36,
        paddingBottom: 32,
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
            {uncertain
              ? <span className="badge-ai" style={{ background: '#FDF0D5' }}>? {t('result.uncertainBadge')}</span>
              : isHealthy
                ? <span className="badge-healthy">✓ {t('result.healthyBadge')}</span>
                : <span className="badge-alert">⚠ {t('result.diseaseBadge')}</span>
            }
          </div>
          <h1 className="anim-fade-up anim-delay-1" style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
            color: '#fff',
            margin: '10px 0 6px',
          }}>{displayName}</h1>
          {!uncertain && (
            <p className="anim-fade-up anim-delay-2" style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: 0 }}>
              {t('result.plant')}: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{t(`crop.${plant}`)}</strong>
              {info?.severity && (
                <> &nbsp;·&nbsp; {t('result.severity')}: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {t(`severity.${info.severity}`)}
                </strong></>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="px-4 sm:px-6" style={{ maxWidth: 860, margin: '0 auto', paddingTop: 32, paddingBottom: 60 }}>

        {/* Image + confidence grid */}
        <div
          className={`anim-fade-up anim-delay-2 grid grid-cols-1 gap-5 ${imageUrl && !uncertain ? 'md:grid-cols-2' : ''}`}
          style={{ marginBottom: 28 }}
        >
          {imageUrl && (
            <div style={{
              borderRadius: 20,
              overflow: 'hidden',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised)',
              aspectRatio: '4/3',
              position: 'relative',
              ...(uncertain && { width: '100%', maxWidth: 420, margin: '0 auto' }),
            }}>
              <img src={imageUrl} alt={t('result.photoAlt')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {gradcamUrl && (
                <img
                  src={gradcamUrl}
                  alt={t('result.attentionAlt')}
                  aria-hidden={!showAttention}
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', opacity: showAttention ? 1 : 0,
                    transition: 'opacity 0.3s',
                  }}
                />
              )}
              {gradcamUrl && (
                <button
                  onClick={() => setShowAttention((v) => !v)}
                  aria-pressed={showAttention}
                  style={{
                    position: 'absolute', left: 12, bottom: 12,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 999, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', color: 'var(--color-text)',
                  }}
                >
                  {showAttention ? t('result.photo') : t('result.attention')}
                </button>
              )}
            </div>
          )}

          {/* No scores on an uncertain result: "Healthy Peach 61.8%" next to a photo of a
              person reads as an answer even under a "not a diagnosis" label. */}
          {!uncertain && (
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
              <ConfidenceBar value={confidence} label={t('result.confidence')} />
              {top3?.length > 1 && <TopPredictions top3={top3} title={t('result.top')} />}
            </div>
          )}
        </div>

        {uncertain ? (
          /* Not a diagnosis, so no treatment. Advising on a guessed disease
             is the failure the abstain path exists to prevent. */
          <div className="anim-fade-up anim-delay-3" style={{
            background: 'var(--color-ai-subtle)',
            border: '1px solid rgba(212,134,11,0.25)',
            borderRadius: 20,
            padding: '28px',
            marginBottom: 28,
          }}>
            <p style={{ margin: '0 0 14px', color: 'var(--color-text)', lineHeight: 1.65 }}>
              {notLeaf ? t('result.notLeafBody') : t('result.uncertainBody')}
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1.8, listStyle: 'disc' }}>
              <li>{t('detect.tip.singleDesc')}</li>
              <li>{t('detect.tip.fillDesc')}</li>
              <li>{t('detect.tip.lightDesc')}</li>
            </ul>
          </div>
        ) : isHealthy ? (
          <div className="anim-fade-up anim-delay-3" style={{
            background: 'var(--color-accent-subtle)',
            border: '1px solid rgba(45,106,79,0.2)',
            borderRadius: 20,
            padding: '36px',
            textAlign: 'center',
            marginBottom: 28,
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }} aria-hidden="true">🌱</div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              color: 'var(--color-accent-hover)',
              marginBottom: 8,
            }}>{t('result.healthyTitle')}</h2>
            <p style={{ color: 'var(--color-accent)', fontSize: '0.9rem', margin: 0 }}>
              {t('result.healthyBody')}
            </p>
            {info?.prevention && (
              <p style={{ color: 'var(--color-accent)', fontSize: '0.875rem', marginTop: 12, opacity: 0.85 }}>
                <strong>{t('result.preventionTip')}</strong> {info.prevention}
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
                  <span style={{ fontSize: '1.2rem' }} aria-hidden="true">🔬</span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('result.symptoms')}</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>
                  {info.symptoms}
                </p>
              </div>
            )}

            {/* How it forms: the cause, how it survives and spreads, and the
                weather that drives it. Knowing why it happened is what makes
                the prevention advice below make sense. */}
            {info?.formation && (
              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 16,
                padding: '20px 22px',
                marginBottom: 16,
                borderLeft: '3px solid var(--color-alert)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: '1.2rem' }} aria-hidden="true">🦠</span>
                  <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>
                    {t('result.formation')}
                  </h2>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.65, margin: 0 }}>
                  {info.formation}
                </p>
              </div>
            )}

            {/* Treatment cards */}
            <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {info?.organic && (
                <TreatmentCard icon="🌿" title={t('result.organic')} content={info.organic} accentColor="var(--color-accent)" />
              )}
              {info?.chemical && (
                <TreatmentCard icon="⚗️" title={t('result.chemical')} content={info.chemical} accentColor="var(--color-ai)" />
              )}
            </div>

            {info?.prevention && (
              <TreatmentCard icon="🛡️" title={t('result.prevention')} content={info.prevention} accentColor="var(--color-text-muted)" />
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
            🔍 {uncertain ? t('result.retake') : t('result.again')}
          </button>
          <Link to="/" className="btn-secondary">← {t('result.home')}</Link>
        </div>

        {/* The field module. Disabled with a reason when this scan may not
            enter -- the same gate the server enforces, so the 2D page and the
            headset cannot disagree about it. */}
        {!uncertain && (
          <div className="anim-fade-up anim-delay-4" style={{
            marginTop: 28,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderLeft: `3px solid ${canEnterField ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 16,
            padding: 24,
          }}>
            <div className="label-caps" style={{ marginBottom: 8 }}>WebXR</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 8px' }}>
              {t('result.fieldTitle')}
            </h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15, margin: '0 0 16px', maxWidth: 520 }}>
              {canEnterField ? t('result.fieldBody') : (blockedReason ?? result.fieldBlockedReason)}
            </p>
            {canEnterField ? (
              <Link to={`/field?scan=${encodeURIComponent(result.id)}`} className="btn-primary">
                {t('result.enterField')}
              </Link>
            ) : (
              <button className="btn-primary" disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}>
                {t('result.enterField')}
              </button>
            )}
          </div>
        )}

        {modelVersion && (
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-text-disabled)' }}>
            {modelVersion} · {status}
          </div>
        )}

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
          <strong style={{ color: 'var(--color-ai)' }}>{t('common.disclaimerLabel')}</strong> {t('common.disclaimer')}
        </div>
      </div>
    </div>
  )
}
