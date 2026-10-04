import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { IfInSessionMode, XR, XRLayer, createXRStore } from '@react-three/xr'

import { useTextTexture } from './textTexture'
import { SingleVideoPlayback, sphereArc, stereoLayout } from './videoLayer'
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

// iwer >= 2.3 will not replace a native navigator.xr, and desktop Chrome has
// one even with no headset attached, so the emulator above never installed and
// "Enter in VR" stayed disabled in dev. The store only emulates after finding
// no VR or AR support at all, so forcing it here cannot clobber a real device.
// devicechange is what Field.jsx listens to for re-checking support.
if (import.meta.env.DEV) {
  const unsubscribe = xrStore.subscribe(({ emulator }) => {
    if (!emulator) return
    unsubscribe()
    const native = navigator.xr
    emulator.installRuntime({ forceInstall: true })
    native?.dispatchEvent(new Event('devicechange'))
  })
}

const CREAM = 0xf6f2eb
const SURFACE = 0xfdfaf5
const BORDER = 0xddd6c8
const INK = '#1e1a14'
const ACCENT = 0x2d6a4f
const ALERT = '#b84c30'
const MUTED = '#7a6f5e'

// Canvas pixels per metre for scene text. 400 keeps a 1.8 m line under 1500 px.
const PX_PER_M = 400

/**
 * Scene text, centred on `position` like drei's <Text anchorX="center">.
 * Sizes are in metres. Drawn by the browser so every script shapes correctly;
 * see textTexture.js.
 */
function Label({ children, fontSize, maxWidth = 4, color = INK, align = 'center', position }) {
  const { texture, width, height } = useTextTexture(String(children ?? ''), {
    size: fontSize * PX_PER_M, maxWidth: maxWidth * PX_PER_M, color, align,
  })
  return (
    <mesh position={position}>
      <planeGeometry args={[width / PX_PER_M, height / PX_PER_M]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

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
function VideoStage({ video, onElement, onLayout }) {
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
    // Switching clips before the dynamic import resolves used to leave
    // hls?.destroy() a no-op on a null, and the late instance would then attach
    // to the same element as its successor -- two Hls objects fighting over one
    // MediaSource, with the first leaking.
    let cancelled = false
    setSize(null)

    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = video.hls_url
    } else {
      // Imported here so hls.js stays out of the chunk until a clip is opened.
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return
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
    // Only ever on loadedmetadata for THIS source. Calling it synchronously
    // read the outgoing clip's videoWidth and immediately undid setSize(null),
    // so a clip that then failed to load kept the previous aspect forever.
    const measure = () => {
      if (!element.videoWidth) return
      setSize({ w: element.videoWidth, h: element.videoHeight })
    }
    element.addEventListener('loadedmetadata', measure)

    return () => {
      cancelled = true
      element.removeEventListener('loadedmetadata', measure)
      hls?.destroy()
      playback.release()
    }
  }, [element, playback, video?.hls_url])

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
      // No negative scale. A native equirect layer's pose is an XRRigidTransform,
      // which cannot carry a mirror, so a -X scale would flip only the
      // non-session fallback mesh and leave the two paths showing mirror images
      // of each other. XRLayer orients the projection itself.
      <XRLayer
        src={element}
        shape="equirect"
        layout={stereoLayout(video.stereo)}
        centralHorizontalAngle={sphereArc(video.projection)}
        upperVerticalAngle={Math.PI / 2}
        lowerVerticalAngle={-Math.PI / 2}
        scale={14}
      />
    )
  }

  // Aspect is per EYE, not of the packed frame. A 1920x2160 top_bottom clip is
  // two 16:9 eyes stacked; using the packed 0.89:1 would squash each eye to
  // half its height.
  const packed = size ?? { w: video.width ?? 16, h: video.height ?? 9 }
  const eye =
    video.stereo === 'top_bottom' ? { w: packed.w, h: packed.h / 2 }
    : video.stereo === 'left_right' ? { w: packed.w / 2, h: packed.h }
    : packed
  const aspect = eye.w / eye.h

  // Capped by ANGULAR size, not pixels: 1.5 m wide at 2.2 m is about a 38
  // degree arc, inside the comfortable forward cone.
  const height = 1.5 / Math.max(aspect, 1)
  const width = height * aspect

  return (
    <XRLayer
      onUpdate={() => onLayout?.({ width, height })}
      src={element}
      shape="quad"
      layout={stereoLayout(video.stereo)}
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
function DiseaseTriangle({ run, position, t }) {
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
      <Label position={[0, 0.265, 0.001]} fontSize={0.058} maxWidth={0.66}>
        {t('vr.triangleTitle')}
      </Label>
      <Label
        position={[0, -0.21, 0.001]} fontSize={0.042} maxWidth={0.56}
        color={run.triangle.environment ? MUTED : ALERT}
      >
        {run.triangle.environment ? t('vr.triangleOk') : t('vr.triangleBroken')}
      </Label>
    </group>
  )
}

function StagePanel({ run, position, t }) {
  const halted = run.haltedAt !== null
  const stage = halted ? run.stages[run.haltedAt] : run.stages[run.stages.length - 1]
  return (
    <group position={position}>
      <Plate width={1.95} height={halted ? 0.68 : 0.46} />
      <Label position={[0, halted ? 0.19 : 0.07, 0.001]} fontSize={0.13} maxWidth={1.8}>
        {stage?.label ?? ''}
      </Label>
      <Label
        position={[0, halted ? -0.06 : -0.07, 0.001]} fontSize={0.07} maxWidth={1.72}
        color={halted ? ALERT : MUTED}
      >
        {halted ? run.summary : t('vr.completedShort')}
      </Label>
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
          : s.outcome === 'failed' || s.outcome === 'blocked' ? 0xb84c30
          : 0xd0c8b8
        return (
          <group key={s.id} position={[x, 0, 0]}>
            <mesh><circleGeometry args={[0.04, 18]} /><meshBasicMaterial color={colour} /></mesh>
            {(s.outcome === 'failed' || s.outcome === 'blocked') && (
              <Label position={[0, 0, 0.002]} fontSize={0.062} color="#f6f2eb">×</Label>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** Shown when a disease has no footage: without it the canvas reads as broken. */
function CycleBoard({ pathogen, t }) {
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
      <Label position={[0, 2.70, -2.4]} fontSize={0.105} color={MUTED} maxWidth={4.4}>
        {t('vr.noFootage')}
      </Label>
      {pathogen && (
        <Label position={[0, 2.50, -2.4]} fontSize={0.088} maxWidth={4.4}>
          {pathogen}
        </Label>
      )}
    </group>
  )
}

export default function FieldScene({
  video, run, pathogen, onElement,
  dials, ranges, onDial, onReset,
  videos = [], videoIndex = 0, onPickVideo, playing, onTogglePlay,
  t,
}) {
  const controls = useRef(null)
  const [layout, setLayout] = useState(null)
  const flat = !video || video.projection === 'flat'

  // Placed against the quad's ACTUAL edges. These were previously constants
  // tuned for a 2.9 x 1.63 plane; the quad is now sized from the clip, and a
  // tall narrow clip (the 228x578 microscopy) is nearly twice the height of a
  // 16:9 one, so fixed offsets either collided with it or left a 0.7 m gap.
  const quadW = layout?.width ?? 1.5
  const quadH = layout?.height ?? 0.85
  const VIDEO_Y = 1.62

  const depth = video ? -1.95 : -2.4
  const stageY = flat && video ? VIDEO_Y + quadH / 2 + 0.36 : video ? 2.25 : 1.98
  const timelineY = flat && video ? VIDEO_Y - quadH / 2 - 0.22 : video ? 0.9 : 1.16
  const triangleX = flat && video ? -(quadW / 2 + 0.52) : video ? -1.5 : -1.55

  return (
    <Canvas camera={{ position: [0, 1.6, 0.01], fov: 72 }} dpr={[1, 1.5]}>
      <color attach="background" args={[CREAM]} />
      <ambientLight intensity={1.4} />

      <XR store={xrStore}>
        <Suspense fallback={null}>
          <VideoStage video={video} onElement={onElement} onLayout={setLayout} />
          {!video && run && <CycleBoard pathogen={pathogen} t={t} />}

          {/* Flat overlay panels are for the 2D canvas. In a headset they are
              replaced by the uikit panel below, which you can actually touch. */}
          <IfInSessionMode deny={['immersive-vr', 'immersive-ar']}>
            {run && (
              <>
                <StagePanel run={run} position={[0, stageY, depth]} t={t} />
                <StageTimeline run={run} position={[0, timelineY, depth]} />
                <DiseaseTriangle run={run} position={[triangleX, 1.56, depth + 0.05]} t={t} />
              </>
            )}
          </IfInSessionMode>

          <IfInSessionMode allow={['immersive-vr', 'immersive-ar']}>
            {run && <DiseaseTriangle run={run} position={[-1.25, 1.62, -1.6]} t={t} />}
            <VrControls
              t={t}
              onExit={() => xrStore.getState().session?.end()}
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

      {/* No zoom. Inside a 360 sphere a dolly walks the camera out through the
          wall, and on a flat panel it adds nothing a closer look needs. */}
      <OrbitControls
        ref={controls}
        enableZoom={false}
        enablePan={false}
        rotateSpeed={flat ? 0.35 : -0.3}
        target={flat ? [0, 1.62, depth] : [0, 1.6, 0]}
      />
    </Canvas>
  )
}
