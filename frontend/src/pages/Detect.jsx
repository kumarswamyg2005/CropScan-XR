import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function Detect() {
  const [image, setImage]     = useState(null)
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, WEBP)')
      return
    }
    setError('')
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }, [])

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
      const form = new FormData()
      form.append('file', image)
      const { data } = await axios.post(`${API_BASE}/predict`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      navigate('/result', { state: { result: data, imageUrl: preview } })
    } catch (err) {
      const msg = err.response?.data?.detail || 'Something went wrong. Is the backend running?'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setImage(null)
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
        padding: '28px 24px 24px',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div className="label-caps" style={{ marginBottom: 8 }}>AI Diagnosis</div>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
            fontWeight: 700,
            margin: 0,
          }}>Detect Crop Disease</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 8, fontSize: '0.95rem' }}>
            Upload a clear photo of the affected leaf — our model identifies 38 disease classes instantly.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '40px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>

          {!preview ? (
            /* ── Drop Zone ─────────────────────────────── */
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className="anim-fade-up"
              style={{
                border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: 24,
                padding: '72px 40px',
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
                }}>🍃</div>

                <p style={{
                  fontFamily: '"Playfair Display", serif',
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 8,
                }}>Drop your leaf image here</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
                  or click to browse — JPG, PNG, WEBP accepted
                </p>

                <div className="label-caps">Best results with a single leaf, good lighting</div>
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
                    alt="Leaf preview"
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
                    title="Remove"
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
                    <span style={{ fontSize: '1rem' }}>📁</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {image?.name}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      flexShrink: 0,
                    }}>
                      {(image?.size / 1024).toFixed(0)} KB
                    </span>
                  </div>

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
                        Analysing…
                      </>
                    ) : '🔍 Analyse Disease'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
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
            <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['🌞', 'Good lighting', 'Natural light works best'],
                ['🎯', 'Single leaf', 'Focus on one affected leaf'],
                ['📐', 'Fill the frame', 'Leaf should take up most of the image'],
                ['🌿', 'Clear background', 'Plain or blurred background helps'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{
                  padding: '14px 16px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{desc}</div>
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
