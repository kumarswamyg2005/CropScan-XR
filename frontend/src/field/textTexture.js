/**
 * Text for the 3D scene and the headset panel, drawn by the browser.
 *
 * drei's <Text> (troika) and uikit's <Text> both lay glyphs out themselves.
 * Neither does Indic shaping: troika cannot reorder a Devanagari or Tamil vowel
 * sign in front of its consonant, and uikit's bundled font has no Indic glyphs
 * at all. So Telugu, Hindi, Tamil and Kannada came out broken or blank in the
 * scene. A 2D canvas uses the browser's own shaper, which gets every script
 * right, and the result goes onto a plane as a texture.
 */

import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

const FONT_STACK =
  "'DM Sans', 'Noto Sans Telugu', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Kannada', sans-serif"
const SCALE = 2 // drawn at 2x so it stays sharp at headset distance
const PAD = 2

/** Greedy word wrap. Pure, so it is testable without a canvas. */
export function wrapLines(text, measure, maxWidth) {
  const lines = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && measure(next) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  return lines
}

const fontSpec = (size, weight) => `${weight} ${size}px ${FONT_STACK}`

/** Returns the texture and its size in CSS px (before SCALE). */
function drawText(text, { size = 24, color = '#1e1a14', weight = 400, maxWidth = 600, align = 'left', lineHeight = 1.3 }) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = fontSpec(size * SCALE, weight)
  ctx.font = font
  const measure = (s) => ctx.measureText(s).width
  const lines = wrapLines(text, measure, maxWidth * SCALE)
  const widest = Math.max(1, ...lines.map(measure))
  const lh = size * SCALE * lineHeight

  canvas.width = Math.ceil(Math.min(widest, maxWidth * SCALE)) + PAD * 2
  canvas.height = Math.ceil(lh * lines.length) + PAD * 2
  ctx.font = font // resizing a canvas resets its context state
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const x = align === 'center' ? canvas.width / 2 : align === 'right' ? canvas.width - PAD : PAD
  lines.forEach((line, i) => ctx.fillText(line, x, PAD + lh * (i + 0.5)))

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return { texture, width: canvas.width / SCALE, height: canvas.height / SCALE }
}

/**
 * A texture of `text`, redrawn when the web font it needs arrives. The Noto
 * faces only download when something asks for their characters, and a canvas
 * drawn before then falls back to a system font; document.fonts.load() both
 * triggers the download and says when it is done.
 */
export function useTextTexture(text, style = {}) {
  const { size = 24, weight = 400, color, maxWidth, align, lineHeight } = style
  const [fontVersion, setFontVersion] = useState(0)

  useEffect(() => {
    const spec = fontSpec(size, weight)
    if (!document.fonts || document.fonts.check(spec, text)) return
    let alive = true
    document.fonts.load(spec, text)
      .then(() => alive && setFontVersion((v) => v + 1))
      .catch(() => {})
    return () => { alive = false }
  }, [text, size, weight])

  const drawn = useMemo(
    () => drawText(text, { size, weight, color, maxWidth, align, lineHeight }),
    // fontVersion is the redraw trigger, not an input
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, size, weight, color, maxWidth, align, lineHeight, fontVersion],
  )
  useEffect(() => () => drawn.texture.dispose(), [drawn])
  return drawn
}
