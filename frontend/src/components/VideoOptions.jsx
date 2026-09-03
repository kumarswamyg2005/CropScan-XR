import { useEffect, useRef, useState } from 'react'

const KIND_LABEL = {
  field360: { en: '360° field', te: '360° క్షేత్రం' },
  field: { en: 'In the field', te: 'పొలంలో' },
  symptom_closeup: { en: 'Close-up', te: 'దగ్గరి దృశ్యం' },
  treatment: { en: 'Treatment', te: 'చికిత్స' },
}

const STAGE_LABEL = {
  survival: 'Overwintering',
  inoculum_production: 'Inoculum production',
  deposition: 'Deposition',
  prepenetration: 'Germination',
  penetration: 'Penetration',
  infection: 'Infection',
  colonization: 'Colonization',
  reproduction: 'Sporulation',
  dispersal: 'Dispersal',
}

function time(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const chip = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
  letterSpacing: '0.04em',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
  whiteSpace: 'nowrap',
}

/**
 * Playback transport plus the clip picker.
 *
 * The attribution line is not optional decoration. Most of this footage is
 * CC BY or CC BY-SA, and attribution is a condition of the licence -- the API
 * carries it on the row and this renders it wherever the clip plays.
 */
export default function VideoOptions({
  videos,
  index,
  onPick,
  element,
  playback,
  lang,
  onJumpToStage,
}) {
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const scrubbing = useRef(false)
  const video = videos[index] ?? null

  useEffect(() => {
    if (!element) return
    const onTime = () => {
      if (!scrubbing.current) setCurrent(element.currentTime)
    }
    const onMeta = () => setDuration(element.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    element.addEventListener('timeupdate', onTime)
    element.addEventListener('loadedmetadata', onMeta)
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    return () => {
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('loadedmetadata', onMeta)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
    }
  }, [element])

  const toggle = () => {
    if (!element || !playback) return
    if (element.paused) playback.play(element).catch(() => {})
    else playback.pause()
  }

  if (videos.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 14 }}>
        {lang === 'te'
          ? 'ఈ వ్యాధికి ఫుటేజ్ ఇంకా ప్రచురించబడలేదు.'
          : 'No footage has been published for this disease yet.'}
      </p>
    )
  }

  return (
    <div style={{ marginTop: 14 }}>
      {/* Transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            cursor: 'pointer', fontSize: 14, color: 'var(--color-text)',
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          onMouseDown={() => { scrubbing.current = true }}
          onTouchStart={() => { scrubbing.current = true }}
          onChange={(e) => setCurrent(Number(e.target.value))}
          onMouseUp={(e) => {
            scrubbing.current = false
            if (element) element.currentTime = Number(e.target.value)
          }}
          onTouchEnd={(e) => {
            scrubbing.current = false
            if (element) element.currentTime = Number(e.target.value)
          }}
          aria-label="Seek"
          style={{ flex: 1, accentColor: 'var(--color-accent)' }}
        />

        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 12,
          color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
        }}>
          {time(current)} / {time(duration)}
        </span>
      </div>

      {/* What you are looking at, and who made it */}
      {video && (
        <div style={{
          marginTop: 14, padding: 16,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <span style={{ ...chip, color: 'var(--color-accent)', borderColor: 'var(--color-accent-subtle)' }}>
              {(KIND_LABEL[video.kind] ?? { en: video.kind, te: video.kind })[lang]}
            </span>
            <span style={chip}>{video.projection === 'flat' ? '2D panel' : '360°'}</span>
            {video.stage_id && (
              <button
                onClick={() => onJumpToStage?.(video.stage_id)}
                style={{ ...chip, cursor: 'pointer', background: 'transparent' }}
                title="Show this stage in the cycle"
              >
                stage · {STAGE_LABEL[video.stage_id] ?? video.stage_id}
              </button>
            )}
          </div>

          <h3 style={{
            fontFamily: '"Playfair Display", serif', fontSize: 19,
            margin: '0 0 6px', lineHeight: 1.3,
          }}>
            {video.title}
          </h3>

          {video.caption && (
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 12px', color: 'var(--color-text)' }}>
              {video.caption}
            </p>
          )}

          {/* Licence condition, rendered wherever the clip plays. */}
          {video.attribution && (
            <p style={{
              fontSize: 12, lineHeight: 1.5, margin: 0,
              color: 'var(--color-text-muted)',
              borderTop: '1px solid var(--color-border)', paddingTop: 10,
            }}>
              {video.attribution}
              {video.license ? ` · ${video.license}` : ''}
              {video.source_url && (
                <>
                  {' · '}
                  <a
                    href={video.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    source
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* Clip picker */}
      {videos.length > 1 && (
        <div style={{ marginTop: 18 }}>
          <div className="label-caps" style={{ marginBottom: 10 }}>
            {lang === 'te' ? 'ఫుటేజ్' : 'Footage'} ({videos.length})
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => onPick(i)}
                aria-pressed={i === index}
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: 12, borderRadius: 10,
                  background: i === index ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                  border: `1px solid ${i === index ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  fontFamily: "'DM Sans', sans-serif",
                  color: 'var(--color-text)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, marginBottom: 6 }}>
                  {v.title}
                </div>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  color: 'var(--color-text-muted)',
                }}>
                  {(KIND_LABEL[v.kind] ?? { en: v.kind })[lang] ?? v.kind}
                  {v.duration_s ? ` · ${time(v.duration_s)}` : ''}
                  {v.projection !== 'flat' ? ' · 360°' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
