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
const SURFACE = 0xfdfaf5
const BORDER = 0xddd6c8
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
function VideoStage({ video, onElement, onStrategy }) {
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

    return () => {
      hls?.destroy()
      playback.release()
    }
  }, [element, playback, video?.hls_url])

  // The page drives play/pause/seek; playback still goes through the
  // one-video-at-a-time manager so a clip switch cannot leave two decoding.
  useEffect(() => {
    onElement?.(element, playback)
    return () => onElement?.(null, playback)
  }, [element, playback, onElement])

  // Start as soon as there are frames to show. Without this the canvas sits on
  // an undecoded first frame -- which reads as a blank screen -- until the user
  // finds the play button. The element is muted, so this is permitted autoplay
  // rather than something the browser will block.
  useEffect(() => {
    const start = () => { playback.play(element).catch(() => {}) }
    element.addEventListener('loadeddata', start)
    if (element.readyState >= 2) start()
    return () => element.removeEventListener('loadeddata', start)
  }, [element, playback, video?.hls_url])

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
    <mesh position={[0, 1.56, -2.2]}>
      <planeGeometry args={[2.9, 1.63]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={DoubleSide} />
    </mesh>
  ) : (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[14, 64, 40, 0, sphereArc(video.projection)]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={BackSide} />
    </mesh>
  )
}

/** Surface plate with a hairline border. Cream text on a cream background is
 *  invisible; every panel needs to sit on something. */
function Plate({ width, height, z = -0.006 }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[width + 0.018, height + 0.018]} />
        <meshBasicMaterial color={BORDER} />
      </mesh>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={SURFACE} />
      </mesh>
    </group>
  )
}

/** Disease triangle: three legs that light as each is satisfied. */
function DiseaseTriangle({ run, position }) {
  const v = [
    [0, 0.20, 0],
    [-0.175, -0.12, 0],
    [0.175, -0.12, 0],
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
            <planeGeometry args={[Math.hypot(dx, dy), on ? 0.018 : 0.008]} />
            <meshBasicMaterial color={on ? ACCENT : 0xd0c8b8} />
          </mesh>
        )
      })}

      {v.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.001]}>
          <circleGeometry args={[0.024, 16]} />
          <meshBasicMaterial color={lit[i] ? ACCENT : 0xd0c8b8} />
        </mesh>
      ))}

      <Text position={[0, 0.265, 0]} fontSize={0.058} color={INK} anchorX="center">
        Disease triangle
      </Text>
      <Text
        position={[0, -0.21, 0]}
        fontSize={0.042}
        color={run.triangle.environment ? MUTED : ALERT}
        anchorX="center"
        maxWidth={0.56}
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
      <Plate width={1.95} height={halted ? 0.68 : 0.46} />
      <Text position={[0, halted ? 0.19 : 0.07, 0]} fontSize={0.13} color={INK} anchorX="center" maxWidth={1.8}>
        {stage?.label ?? ''}
      </Text>
      <Text
        position={[0, halted ? -0.06 : -0.07, 0]}
        fontSize={0.07}
        color={halted ? ALERT : MUTED}
        anchorX="center"
        maxWidth={1.72}
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
      <Plate width={1.95} height={0.22} />
      {run.stages.map((s, i) => {
        const x = (i - (run.stages.length - 1) / 2) * 0.2
        const colour =
          s.outcome === 'passed' ? ACCENT
          : s.outcome === 'failed' || s.outcome === 'blocked' ? ALERT
          : 0xd0c8b8
        return (
          <group key={s.id} position={[x, 0, 0]}>
            <mesh>
              <circleGeometry args={[0.04, 18]} />
              <meshBasicMaterial color={colour} />
            </mesh>
            {(s.outcome === 'failed' || s.outcome === 'blocked') && (
              <Text position={[0, 0, 0.002]} fontSize={0.062} color={CREAM} anchorX="center" anchorY="middle">
                ×
              </Text>
            )}
          </group>
        )
      })}
    </group>
  )
}

/**
 * Shown when a disease has no footage yet.
 *
 * Without this the canvas is an empty cream rectangle with three small plates
 * floating in it, which reads as a broken screen rather than as "no video".
 * Four of the fourteen documented diseases are in that state, so the empty case
 * is a real state to design for, not an edge case.
 */
function CycleBoard({ run, pathogen }) {
  return (
    <group>
      {/* A backdrop so the composition reads as deliberate. */}
      <mesh position={[0, 1.55, -2.6]}>
        <planeGeometry args={[5.2, 2.9]} />
        <meshBasicMaterial color={0xefe9dd} />
      </mesh>
      <mesh position={[0, 1.55, -2.59]}>
        <planeGeometry args={[5.0, 2.72]} />
        <meshBasicMaterial color={CREAM} />
      </mesh>

      <Text position={[0, 2.70, -2.4]} fontSize={0.105} color={MUTED} anchorX="center" maxWidth={4.4} textAlign="center">
        No footage published for this disease yet — the cycle still runs
      </Text>
      {pathogen && (
        <Text position={[0, 2.50, -2.4]} fontSize={0.088} color={INK} anchorX="center" maxWidth={4.4} textAlign="center">
          {pathogen}
        </Text>
      )}
    </group>
  )
}

export default function FieldScene({ video, run, pathogen, onElement, onStrategy }) {
  const controls = useRef(null)
  const flat = !video || video.projection === 'flat'

  // Panel placement, by what is on screen.
  //
  // With a flat clip the overlay goes AROUND the video, never over it: the
  // whole point is to look at the footage, and a panel across the middle of a
  // microscopy clip hides the thing being explained. The plane spans roughly
  // y 0.74-2.37 and x +/-1.45, so the stage card sits above it, the timeline
  // below, and the triangle outside its left edge.
  //
  // With no video the panels move forward and become the subject.
  const flatVideo = video && video.projection === 'flat'
  const depth = video ? -1.95 : -2.4
  const stageY = flatVideo ? 2.72 : video ? 2.25 : 1.98
  const timelineY = flatVideo ? 0.44 : video ? 0.9 : 1.16
  const triangleX = flatVideo ? -1.82 : video ? -1.5 : -1.55
  const triangleY = flatVideo ? 1.56 : 1.58

  return (
    <Canvas camera={{ position: [0, 1.6, 0.01], fov: 72 }} dpr={[1, 1.5]}>
      <color attach="background" args={[CREAM]} />
      <ambientLight intensity={1.4} />

      <XR store={xrStore}>
        <Suspense fallback={null}>
          <VideoStage video={video} onElement={onElement} onStrategy={onStrategy} />
          {!video && run && <CycleBoard run={run} pathogen={pathogen} />}
          {run && (
            <>
              <StagePanel run={run} position={[0, stageY, depth]} />
              <StageTimeline run={run} position={[0, timelineY, depth]} />
              <DiseaseTriangle run={run} position={[triangleX, triangleY, depth + 0.05]} />
            </>
          )}
        </Suspense>
      </XR>

      {/* 360: look around from the centre of the sphere, inverted drag so it
          feels like turning your head. Flat: the content is in front of you, so
          normal orbiting is right. */}
      <OrbitControls
        ref={controls}
        enableZoom={!flat}
        enablePan={false}
        rotateSpeed={flat ? 0.35 : -0.3}
        target={flat ? [0, 1.6, depth] : [0, 1.6, 0]}
      />
    </Canvas>
  )
}
