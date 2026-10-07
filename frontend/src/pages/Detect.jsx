import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useLang } from '../context/LanguageContext'
import { CROPS } from '../crops'

// Matches the API's max_upload_bytes. Checked here so a farmer on a slow
// connection is told before the upload, not after it.
const MAX_MB = 10

/** A failed scan, said in words a farmer can act on. */
function scanError(err, t) {
  if (err.status === 503) return t('detect.err.noModel')
  if (err.status === 502) return t('detect.err.storage')
  if (err.status === 413) return t('detect.err.tooBig', { mb: MAX_MB })
  if (err.status === 400) return t('detect.err.badImage')
  if (err.status === undefined) return t('detect.err.network')
  return t('detect.err.server')
}

const TIPS = [
  ['🌞', 'detect.tip.light', 'detect.tip.lightDesc'],
  ['🎯', 'detect.tip.single', 'detect.tip.singleDesc'],
  ['📐', 'detect.tip.fill', 'detect.tip.fillDesc'],
  ['🌿', 'detect.tip.background', 'detect.tip.backgroundDesc'],
]

export default function Detect() {
  const [image, setImage]     = useState(null)
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [crop, setCrop]       = useState('')
  const fileInputRef = useRef(null)
  const navigate = useNavigate()
  const { lang, t } = useLang()

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t('detect.err.notImage'))
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(t('detect.err.tooBig', { mb: MAX_MB }))
      return
    }
    setError('')
    setImage(file)
    // ponytail: the last preview is not revoked on unmount -- Result still
    // shows it. One blob per scan; revoked whenever it is replaced here.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
  }, [t])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const analyze = async () => {
    if (!image) return
    setLoading(true)
    setError('')
    try {
      const result = await api.createScan(image, lang, crop)
      // The id goes in the URL so a reload, a language switch or a shared
      // link can fetch the scan again; state is only for the instant paint.
      navigate(`/result?scan=${encodeURIComponent(result.id)}`, { state: { result, imageUrl: preview } })
    } catch (err) {
      console.error('[CropScan] scan failed', err)
      setError(scanError(err, t))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setImage(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Page header strip */}
      <div style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }} className="px-4 pb-6 pt-7 sm:px-6">
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div className="label-caps" style={{ marginBottom: 8 }}>{t('detect.label')}</div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
            fontWeight: 700,
            margin: 0,
          }}>{t('detect.title')}</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 8, fontSize: '0.95rem' }}>
            {t('detect.lead')}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="px-4 py-8 sm:px-6 sm:py-10" style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>

          {!preview ? (
            /* ── Drop Zone ─────────────────────────────── */
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={t('detect.drop')}
              className="anim-fade-up px-6 py-14 sm:px-10 sm:py-[72px]"
              style={{
                border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: 24,
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                transition: 'border-color 0.2s, background 0.2s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Dot-grid decoration inside drop zone */}
              <div className="dot-grid" style={{
                position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none',
              }} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: 20,
                  background: 'var(--color-accent-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  margin: '0 auto 20px',
                  border: '1px solid rgba(45,106,79,0.15)',
                }} aria-hidden="true">🍃</div>

                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 8,
                }}>{t('detect.drop')}</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
                  {t('detect.browse')}
                </p>

                <div className="label-caps">{t('detect.best')}</div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>

          ) : (
            /* ── Preview + Analyze ─────────────────────── */
            <div className="anim-fade-up">
              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(30,26,20,0.08)',
              }}>
                {/* Image preview */}
                <div style={{ position: 'relative', background: 'var(--color-surface-raised)', maxHeight: 360, overflow: 'hidden' }}>
                  <img
                    src={preview}
                    alt={t('detect.previewAlt')}
                    style={{ width: '100%', maxHeight: 360, objectFit: 'contain', display: 'block' }}
                  />
                  <button
                    onClick={reset}
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'rgba(30,26,20,0.55)',
                      backdropFilter: 'blur(8px)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}
                    title={t('detect.remove')}
                    aria-label={t('detect.remove')}
                  >×</button>
                </div>

                {/* File info + button */}
                <div style={{ padding: '20px 24px 24px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 20,
                    padding: '10px 14px',
                    background: 'var(--color-surface-raised)',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                  }}>
                    <span style={{ fontSize: '1rem' }} aria-hidden="true">📁</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {image?.name}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      flexShrink: 0,
                    }}>
                      {(image?.size / 1024).toFixed(0)} KB
                    </span>
                  </div>

                  {/* Naming the crop stops look-alike crops competing (corn vs rice, pepper vs
                      chilli): about 59% -> 81% right on real field photos. */}
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {t('detect.crop')}
                    <select
                      value={crop}
                      onChange={(e) => setCrop(e.target.value)}
                      style={{
                        padding: '10px 12px', borderRadius: 10, border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.95rem',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <option value="">{t('detect.cropAny')}</option>
                      {CROPS.map(([icon, plant]) => (
                        <option key={plant} value={plant}>{icon} {t(`crop.${plant}`)}</option>
                      ))}
                    </select>
                  </label>

                  <button
                    onClick={analyze}
                    disabled={loading}
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '0.95rem', opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? (
                      <>
                        <span style={{
                          display: 'inline-block',
                          width: 18,
                          height: 18,
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          borderRadius: '50%',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                        {t('detect.analysing')}
                      </>
                    ) : `🔍 ${t('detect.analyse')}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" style={{
              marginTop: 16,
              padding: '14px 18px',
              borderRadius: 12,
              background: 'var(--color-alert-subtle)',
              border: '1px solid rgba(184,76,48,0.2)',
              color: 'var(--color-alert)',
              fontSize: '0.875rem',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Tips */}
          {!preview && (
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TIPS.map(([icon, title, desc]) => (
                <div key={title} style={{
                  padding: '14px 16px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }} aria-hidden="true">{icon}</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{t(title)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t(desc)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
