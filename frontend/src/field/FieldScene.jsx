import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import { XR, createXRStore } from '@react-three/xr'
import { BackSide, DoubleSide, VideoTexture } from 'three'

import { SingleVideoPlayback, chooseStrategy, createVideoLayer, sphereArc } from './videoLayer'

/**
 * Teleport only. No smooth locomotion: it is the main comfort risk and there
 * is nowhere to walk to in a video theatre.
 *
 * The emulator is development tooling and carries ~4.5 MB of synthetic room
 * meshes, so it is switched off outside dev.
 */
export const xrStore = createXRStore({
  emulate: import.meta.env.DEV ? 'metaQuest3' : false,
  foveation: 0.6,
})

const CREAM = 0xf6f2eb
const INK = 0x1e1a14
const ACCENT = 0x2d6a4f
const ALERT = 0xb84c30
const MUTED = 0x7a6f5e

/**
 * The video theatre. This IS the scene -- 360 footage of the real disease,
 * with the cycle stages and the disease triangle as flat panels over it.
 *
 * A media layer takes the video straight to the compositor when the session
 * supports one; otherwise it becomes a texture on a sphere (360) or a plane
 * (flat). Playback goes through SingleVideoPlayback so a second clip cannot
 * start while one is running.
 */
function VideoStage({ video, playing, onReady, onStrategy }) {
  const gl = useThree((state) => state.gl)
  const playback = useMemo(() => new SingleVideoPlayback(), [])
  const [strategy, setStrategy] = useState('video-texture')

  const element = useMemo(() => {
    const el = document.createElement('video')
    el.crossOrigin = 'anonymous'
    el.playsInline = true
    el.loop = true
    el.muted = true
    el.preload = 'auto'
    return el
  }, [])

  useEffect(() => {
    if (!video?.hls_url) return
    let hls = null

    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = video.hls_url                       // Safari plays HLS natively
    } else {
      // Imported here, not at module scope, so hls.js stays out of the chunk
      // until a clip is actually opened.
      import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          element.src = video.hls_url
          return
        }
        const instance = new Hls({ enableWorker: true })
        instance.loadSource(video.hls_url)
        instance.attachMedia(element)
        hls = instance
      })
    }

    const ready = () => onReady?.(element)
    element.addEventListener('loadeddata', ready)
    return () => {
      element.removeEventListener('loadeddata', ready)
      hls?.destroy()
      playback.release()
    }
  }, [element, playback, video?.hls_url, onReady])

  useEffect(() => {
    if (playing) playback.play(element).catch(() => {})
    else playback.pause()
  }, [playing, playback, element])

  useEffect(() => {
    const session = gl.xr.getSession()
    const chosen = chooseStrategy(session, 'XRMediaBinding' in globalThis, 'XRWebGLBinding' in globalThis)
    setStrategy(chosen)
    onStrategy?.(chosen)

    if (chosen === 'video-texture' || !session || !video) return
    let dispose
    createVideoLayer(session, element, video.projection, video.stereo).then((result) => {
      dispose = result?.dispose
      if (!result) setStrategy('video-texture')
    })
    return () => dispose?.()
  }, [element, gl, video, onStrategy])

  const texture = useMemo(
    () => (strategy === 'video-texture' ? new VideoTexture(element) : null),
    [element, strategy],
  )
  useEffect(() => () => texture?.dispose(), [texture])

  // Nothing is drawn when a media layer owns the pixels: the compositor is
  // already showing the video at full resolution.
  if (!texture || !video) return null

  return video.projection === 'flat' ? (
    <mesh position={[0, 1.5, -2.2]}>
      <planeGeometry args={[3.2, 1.8]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={DoubleSide} />
    </mesh>
  ) : (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[14, 64, 40, 0, sphereArc(video.projection)]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={BackSide} />
    </mesh>
  )
}

/** Disease triangle: three legs that light as each is satisfied. */
function DiseaseTriangle({ run, position }) {
  const v = [
    [0, 0.14, 0],
    [-0.12, -0.08, 0],
    [0.12, -0.08, 0],
  ]
  const legs = [
    [0, 1, run.triangle.host && run.triangle.pathogen],
    [1, 2, run.triangle.pathogen && run.triangle.environment],
    [2, 0, run.triangle.environment && run.triangle.host],
  ]
  const lit = [run.triangle.host, run.triangle.pathogen, run.triangle.environment]

  return (
    <group position={position}>
      {/* Opaque plate behind everything so the glyph stays legible against
          bright 360 footage. */}
      <mesh position={[0, 0.01, -0.006]}>
        <planeGeometry args={[0.4, 0.42]} />
        <meshBasicMaterial color={CREAM} transparent opacity={0.94} />
      </mesh>

      {legs.map(([a, b, on], i) => {
        const [x1, y1] = v[a]
        const [x2, y2] = v[b]
        const dx = x2 - x1
        const dy = y2 - y1
        return (
          <mesh
            key={i}
            position={[(x1 + x2) / 2, (y1 + y2) / 2, 0]}
            rotation={[0, 0, Math.atan2(dy, dx)]}
          >
            <planeGeometry args={[Math.hypot(dx, dy), on ? 0.011 : 0.005]} />
            <meshBasicMaterial color={on ? ACCENT : 0xd0c8b8} />
          </mesh>
        )
      })}

      {v.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.001]}>
          <circleGeometry args={[0.016, 14]} />
          <meshBasicMaterial color={lit[i] ? ACCENT : 0xd0c8b8} />
        </mesh>
      ))}

      <Text position={[0, 0.185, 0]} fontSize={0.028} color={INK} anchorX="center">
        Disease triangle
      </Text>
      <Text
        position={[0, -0.14, 0]}
        fontSize={0.021}
        color={run.triangle.environment ? MUTED : ALERT}
        anchorX="center"
        maxWidth={0.36}
        textAlign="center"
      >
        {run.triangle.environment ? 'all three satisfied' : 'environment leg broken'}
      </Text>
    </group>
  )
}

/** The stage read-out that rides over the footage. */
function StagePanel({ run, position }) {
  const halted = run.haltedAt !== null
  const stage = halted ? run.stages[run.haltedAt] : run.stages[run.stages.length - 1]

  return (
    <group position={position}>
      <mesh position={[0, 0, -0.006]}>
        <planeGeometry args={[1.0, halted ? 0.42 : 0.3]} />
        <meshBasicMaterial color={CREAM} transparent opacity={0.94} />
      </mesh>
      <Text position={[0, halted ? 0.13 : 0.06, 0]} fontSize={0.05} color={INK} anchorX="center" maxWidth={0.9}>
        {stage?.label ?? ''}
      </Text>
      <Text
        position={[0, halted ? -0.03 : -0.05, 0]}
        fontSize={0.032}
        color={halted ? ALERT : MUTED}
        anchorX="center"
        maxWidth={0.9}
        textAlign="center"
      >
        {halted ? run.summary : 'The cycle completed.'}
      </Text>
    </group>
  )
}

/** Nine dots; an × marks the stage that failed. */
function StageTimeline({ run, position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.006]}>
        <planeGeometry args={[1.5, 0.14]} />
        <meshBasicMaterial color={CREAM} transparent opacity={0.94} />
      </mesh>
      {run.stages.map((s, i) => {
        const x = (i - (run.stages.length - 1) / 2) * 0.15
        const colour =
          s.outcome === 'passed' ? ACCENT
          : s.outcome === 'failed' || s.outcome === 'blocked' ? ALERT
          : 0xd0c8b8
        return (
          <group key={s.id} position={[x, 0, 0]}>
            <mesh>
              <circleGeometry args={[0.028, 16]} />
              <meshBasicMaterial color={colour} />
            </mesh>
            {(s.outcome === 'failed' || s.outcome === 'blocked') && (
              <Text position={[0, 0, 0.002]} fontSize={0.042} color={CREAM} anchorX="center" anchorY="middle">
                ×
              </Text>
            )}
          </group>
        )
      })}
    </group>
  )
}

export default function FieldScene({ video, run, playing, onReady, onStrategy }) {
  const controls = useRef(null)

  return (
    <Canvas camera={{ position: [0, 1.6, 0.01], fov: 72 }} dpr={[1, 1.5]}>
      <color attach="background" args={[CREAM]} />
      <ambientLight intensity={1.4} />

      <XR store={xrStore}>
        <Suspense fallback={null}>
          <VideoStage video={video} playing={playing} onReady={onReady} onStrategy={onStrategy} />
          {run && (
            <>
              <StagePanel run={run} position={[0, 1.95, -1.5]} />
              <StageTimeline run={run} position={[0, 1.05, -1.5]} />
              <DiseaseTriangle run={run} position={[-1.15, 1.5, -1.4]} />
            </>
          )}
        </Suspense>
      </XR>

      {/* Look around from the centre of the sphere; no panning out of it. */}
      <OrbitControls ref={controls} enableZoom={false} enablePan={false} rotateSpeed={-0.3} target={[0, 1.6, 0]} />
    </Canvas>
  )
}
