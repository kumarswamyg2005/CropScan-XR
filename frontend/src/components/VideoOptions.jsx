import { useEffect, useRef, useState } from 'react'

function time(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const chip = {
  fontFamily: 'var(--font-mono)',
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
  t,
  stageLabels = {},
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

  // Commit a seek. Pointer and touch commit on release so dragging does not
  // thrash the decoder; the keyboard has no release, so it commits on keyup.
  const seek = (value) => {
    scrubbing.current = false
    if (element) element.currentTime = Number(value)
  }

  const toggle = () => {
    if (!element || !playback) return
    if (element.paused) playback.play(element).catch(() => {})
    else playback.pause()
  }

  if (videos.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 14 }}>
        {t('video.none')}
      </p>
    )
  }

  return (
    <div style={{ marginTop: 14 }}>
      {/* Transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={toggle}
          aria-label={playing ? t('video.pause') : t('video.play')}
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
          onPointerDown={() => { scrubbing.current = true }}
          onChange={(e) => setCurrent(Number(e.target.value))}
          onPointerUp={(e) => seek(e.target.value)}
          onKeyUp={(e) => seek(e.target.value)}
          aria-label={t('video.seek')}
          style={{ flex: 1, accentColor: 'var(--color-accent)' }}
        />

        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
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
              {t(`video.kind.${video.kind}`)}
            </span>
            <span style={chip}>{video.projection === 'flat' ? t('video.panel2d') : '360°'}</span>
            {video.stage_id && (
              <button
                onClick={() => onJumpToStage?.(video.stage_id)}
                style={{ ...chip, cursor: 'pointer', background: 'transparent' }}
                title={t('video.showStage')}
              >
                {t('video.stage')} · {stageLabels[video.stage_id] ?? video.stage_id}
              </button>
            )}
          </div>

          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 19,
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
                    {t('video.source')}
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
            {t('field.clips')} ({videos.length})
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
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--color-text)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, marginBottom: 6 }}>
                  {v.title}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--color-text-muted)',
                }}>
                  {t(`video.kind.${v.kind}`)}
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
