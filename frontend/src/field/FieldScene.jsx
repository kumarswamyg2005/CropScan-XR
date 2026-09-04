import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import { IfInSessionMode, XR, XRLayer, createXRStore } from '@react-three/xr'

import { SingleVideoPlayback, sphereArc } from './videoLayer'
import VrControls from './VrControls'

/**
 * No locomotion. The viewer stands at the centre of the footage; there is
 * nowhere to walk to, and smooth locomotion is the main comfort risk.
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
 * The video.
 *
 * XRLayer is the library's own WebXR Media Layers binding: inside a session it
 * creates a real quad or equirect layer, so the compositor samples the video
 * once at source resolution instead of the app resampling it into a GPU texture
 * every frame. Outside a session it falls back to a textured mesh on its own.
 * This replaces a hand-rolled XRMediaBinding path that did the same job with
 * more code and no fallback for the polyfill case.
 */
function VideoStage({ video, onElement, onSize }) {
  const playback = useMemo(() => new SingleVideoPlayback(), [])
  const [size, setSize] = useState(null)

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
    setSize(null)

    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = video.hls_url
    } else {
      // Imported here so hls.js stays out of the chunk until a clip is opened.
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

    // The panel is sized from the clip's real pixels. A 320x240 microscopy clip
    // stretched across a 3 m panel is a wall of blur; shown at its own aspect
    // and a sane angular size it is sharp.
    const measure = () => {
      if (!element.videoWidth) return
      const s = { w: element.videoWidth, h: element.videoHeight }
      setSize(s)
      onSize?.(s)
    }
    element.addEventListener('loadedmetadata', measure)
    measure()

    return () => {
      element.removeEventListener('loadedmetadata', measure)
      hls?.destroy()
      playback.release()
    }
  }, [element, playback, video?.hls_url, onSize])

  useEffect(() => {
    onElement?.(element, playback)
    return () => onElement?.(null, playback)
  }, [element, playback, onElement])

  // Start as soon as there are frames. Muted, so this is permitted autoplay.
  useEffect(() => {
    const start = () => playback.play(element).catch(() => {})
    element.addEventListener('loadeddata', start)
    if (element.readyState >= 2) start()
    return () => element.removeEventListener('loadeddata', start)
  }, [element, playback, video?.hls_url])

  if (!video) return null

  if (video.projection !== 'flat') {
    return (
      <XRLayer
        src={element}
        shape="equirect"
        layout={video.stereo === 'top_bottom' ? 'stereo-top-bottom'
              : video.stereo === 'left_right' ? 'stereo-left-right' : 'mono'}
        centralHorizontalAngle={sphereArc(video.projection)}
        upperVerticalAngle={Math.PI / 2}
        lowerVerticalAngle={-Math.PI / 2}
        scale={[-14, 14, 14]}
      />
    )
  }

  // Cap the panel by ANGULAR size, not pixels: about 1.5 m wide at 2.2 m is
  // roughly a 38 degree arc, which sits inside the comfortable forward cone.
  const aspect = size ? size.w / size.h : 16 / 9
  const height = 1.5 / Math.max(aspect, 1)
  const width = height * aspect

  return (
    <XRLayer
      src={element}
      shape="quad"
      layout={video.stereo === 'top_bottom' ? 'stereo-top-bottom'
            : video.stereo === 'left_right' ? 'stereo-left-right' : 'mono'}
      position={[0, 1.62, -2.2]}
      scale={[width, height, 1]}
    />
  )
}

/** Surface plate with a hairline border. Cream on cream is invisible. */
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
  const v = [[0, 0.2, 0], [-0.175, -0.12, 0], [0.175, -0.12, 0]]
  const legs = [
    [0, 1, run.triangle.host && run.triangle.pathogen],
    [1, 2, run.triangle.pathogen && run.triangle.environment],
    [2, 0, run.triangle.environment && run.triangle.host],
  ]
  const lit = [run.triangle.host, run.triangle.pathogen, run.triangle.environment]

  return (
    <group position={position}>
      <group position={[0, 0.01, 0]}>
        <Plate width={0.72} height={0.76} />
      </group>
      {legs.map(([a, b, on], i) => {
        const [x1, y1] = v[a]
        const [x2, y2] = v[b]
        const dx = x2 - x1
        const dy = y2 - y1
        return (
          <mesh key={i} position={[(x1 + x2) / 2, (y1 + y2) / 2, 0]} rotation={[0, 0, Math.atan2(dy, dx)]}>
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
        position={[0, -0.21, 0]} fontSize={0.042}
        color={run.triangle.environment ? MUTED : ALERT}
        anchorX="center" maxWidth={0.56} textAlign="center"
      >
        {run.triangle.environment ? 'all three satisfied' : 'environment leg broken'}
      </Text>
    </group>
  )
}

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
        position={[0, halted ? -0.06 : -0.07, 0]} fontSize={0.07}
        color={halted ? ALERT : MUTED} anchorX="center" maxWidth={1.72} textAlign="center"
      >
        {halted ? run.summary : 'The cycle completed.'}
      </Text>
    </group>
  )
}

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
            <mesh><circleGeometry args={[0.04, 18]} /><meshBasicMaterial color={colour} /></mesh>
            {(s.outcome === 'failed' || s.outcome === 'blocked') && (
              <Text position={[0, 0, 0.002]} fontSize={0.062} color={CREAM} anchorX="center" anchorY="middle">×</Text>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** Shown when a disease has no footage: without it the canvas reads as broken. */
function CycleBoard({ pathogen }) {
  return (
    <group>
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

export default function FieldScene({
  video, run, pathogen, onElement, onStrategy,
  dials, ranges, onDial, onReset,
  videos = [], videoIndex = 0, onPickVideo, playing, onTogglePlay,
}) {
  const controls = useRef(null)
  const [size, setSize] = useState(null)
  const flat = !video || video.projection === 'flat'

  useEffect(() => { onStrategy?.(video ? 'xr-layer' : 'none') }, [video, onStrategy])

  const depth = video ? -1.95 : -2.4
  const stageY = flat && video ? 2.72 : video ? 2.25 : 1.98
  const timelineY = flat && video ? 0.44 : video ? 0.9 : 1.16
  const triangleX = flat && video ? -1.82 : video ? -1.5 : -1.55

  return (
    <Canvas camera={{ position: [0, 1.6, 0.01], fov: 72 }} dpr={[1, 1.5]}>
      <color attach="background" args={[CREAM]} />
      <ambientLight intensity={1.4} />

      <XR store={xrStore}>
        <Suspense fallback={null}>
          <VideoStage video={video} onElement={onElement} onSize={setSize} />
          {!video && run && <CycleBoard pathogen={pathogen} />}

          {/* Flat overlay panels are for the 2D canvas. In a headset they are
              replaced by the uikit panel below, which you can actually touch. */}
          <IfInSessionMode deny={['immersive-vr', 'immersive-ar']}>
            {run && (
              <>
                <StagePanel run={run} position={[0, stageY, depth]} />
                <StageTimeline run={run} position={[0, timelineY, depth]} />
                <DiseaseTriangle run={run} position={[triangleX, 1.56, depth + 0.05]} />
              </>
            )}
          </IfInSessionMode>

          <IfInSessionMode allow={['immersive-vr', 'immersive-ar']}>
            {run && <DiseaseTriangle run={run} position={[-1.25, 1.62, -1.6]} />}
            <VrControls
              run={run}
              dials={dials}
              ranges={ranges}
              onDial={onDial}
              onReset={onReset}
              videos={videos}
              videoIndex={videoIndex}
              onPickVideo={onPickVideo}
              playing={playing}
              onTogglePlay={onTogglePlay}
              pathogen={pathogen}
            />
          </IfInSessionMode>
        </Suspense>
      </XR>

      <OrbitControls
        ref={controls}
        enableZoom={!flat}
        enablePan={false}
        rotateSpeed={flat ? 0.35 : -0.3}
        target={flat ? [0, 1.62, depth] : [0, 1.6, 0]}
      />
    </Canvas>
  )
}
