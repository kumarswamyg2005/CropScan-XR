import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { BackSide, DoubleSide, VideoTexture, type Mesh } from 'three'

import type { Video } from '../lib/api'
import { tokenHex } from '../tokens'
import {
  SingleVideoPlayback,
  chooseStrategy,
  createVideoLayer,
  type LayerStrategy,
} from './videoLayer'

export interface Hotspot {
  /** Longitude/latitude on the sphere, degrees. Authored per clip. */
  lon: number
  lat: number
  label: string
}

/**
 * Scene 3 — the Field Theatre.
 *
 * 360 field footage of the real disease, plus flat treatment clips.
 *
 * The video element is created once and reused. A media layer takes it
 * straight to the compositor when the session supports one; otherwise it
 * becomes a texture on a sphere (360) or a plane (flat). Playback goes through
 * SingleVideoPlayback, so a second clip cannot start while one is running.
 */
export default function FieldTheatre({
  video,
  hotspots = [],
  onScore,
}: {
  video: Video
  hotspots?: Hotspot[]
  onScore?: (found: number, total: number) => void
}) {
  const gl = useThree((state) => state.gl)
  const mesh = useRef<Mesh>(null)
  const playback = useMemo(() => new SingleVideoPlayback(), [])
  const [strategy, setStrategy] = useState<LayerStrategy>('video-texture')
  const [found, setFound] = useState<Set<string>>(new Set())

  const element = useMemo(() => {
    const el = document.createElement('video')
    el.crossOrigin = 'anonymous'
    el.playsInline = true
    el.loop = true
    el.preload = 'metadata'
    return el
  }, [])

  // --- source ---------------------------------------------------------------
  useEffect(() => {
    if (!video.hls_url) return
    let hls: { destroy: () => void } | null = null

    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = video.hls_url                       // Safari plays HLS natively
    } else {
      // hls.js is imported here, not at module scope, so it stays out of the
      // XR chunk until a clip is actually opened.
      void import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          element.src = video.hls_url!
          return
        }
        const instance = new Hls({ enableWorker: true })
        instance.loadSource(video.hls_url!)
        instance.attachMedia(element)
        hls = instance
      })
    }

    return () => {
      hls?.destroy()
      playback.release()
    }
  }, [element, playback, video.hls_url])

  // --- layer or texture -----------------------------------------------------
  useEffect(() => {
    const session = gl.xr.getSession()
    const hasMediaBinding = 'XRMediaBinding' in globalThis
    const hasPolyfill = 'XRWebGLBinding' in globalThis
    const chosen = chooseStrategy(session, hasMediaBinding, hasPolyfill)
    setStrategy(chosen)

    if (chosen === 'video-texture' || !session) return
    let dispose: (() => void) | undefined

    void createVideoLayer(session, element, video.projection, video.stereo).then((result) => {
      dispose = result?.dispose
      if (!result) setStrategy('video-texture')
    })

    return () => dispose?.()
  }, [element, gl, video.projection, video.stereo])

  const texture = useMemo(
    () => (strategy === 'video-texture' ? new VideoTexture(element) : null),
    [element, strategy],
  )
  useEffect(() => () => texture?.dispose(), [texture])

  function toggleHotspot(label: string) {
    const next = new Set(found)
    next.has(label) ? next.delete(label) : next.add(label)
    setFound(next)
    onScore?.(next.size, hotspots.length)
  }

  return (
    <group>
      {/* Nothing is drawn when a media layer owns the pixels -- the compositor
          is already showing the video at full resolution. */}
      {texture &&
        (video.projection === 'flat' ? (
          <mesh ref={mesh} position={[0, 1.4, -1.5]}>
            <planeGeometry args={[1.2, 0.675]} />
            <meshBasicMaterial map={texture} toneMapped={false} side={DoubleSide} />
          </mesh>
        ) : (
          <mesh ref={mesh} scale={[-1, 1, 1]}>
            <sphereGeometry
              args={[
                12,
                48,
                32,
                0,
                video.projection === 'equirect180' ? Math.PI : Math.PI * 2,
              ]}
            />
            <meshBasicMaterial map={texture} toneMapped={false} side={BackSide} />
          </mesh>
        ))}

      {/* "Spot the symptom": pause, point at the lesions, score against
          authored hotspots. Small, and it turns passive video into training. */}
      {hotspots.map((hotspot) => {
        const phi = ((90 - hotspot.lat) * Math.PI) / 180
        const theta = ((hotspot.lon + 180) * Math.PI) / 180
        const r = 6
        const position: [number, number, number] = [
          -r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta),
        ]
        const hit = found.has(hotspot.label)
        return (
          <mesh
            key={hotspot.label}
            position={position}
            onClick={() => toggleHotspot(hotspot.label)}
          >
            <ringGeometry args={[0.28, 0.34, 24]} />
            <meshBasicMaterial
              color={hit ? tokenHex('chlorophyll') : tokenHex('chlorosis')}
              side={DoubleSide}
              transparent
              opacity={hit ? 0.95 : 0.55}
            />
          </mesh>
        )
      })}

      {/* Opaque plate behind the caption, always (PRD 4.6). */}
      <group position={[0, 0.7, -1.5]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[1.3, 0.16]} />
          <meshBasicMaterial color={tokenHex('sheet')} />
        </mesh>
        <Text fontSize={0.055} color={tokenHex('ink')} maxWidth={1.2} anchorX="center">
          {video.title}
        </Text>
      </group>

      {hotspots.length > 0 && (
        <Text
          position={[0, 0.52, -1.5]}
          fontSize={0.04}
          color={tokenHex('ink-soft')}
          anchorX="center"
          outlineWidth={0.006}
          outlineColor={tokenHex('sheet')}
        >
          {`${found.size} / ${hotspots.length} symptoms found · ${strategy}`}
        </Text>
      )}
    </group>
  )
}
