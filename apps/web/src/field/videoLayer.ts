/**
 * Video for the Field Theatre.
 *
 * Two platform facts drive this file:
 *
 * 1. WebXR Media Layers beat an in-scene video texture. The compositor samples
 *    the video once at full resolution instead of the app resampling it into a
 *    GPU texture every frame -- better quality, less GPU. So the order is
 *    native XRMediaBinding, then the Layers polyfill (which is what makes the
 *    module developable on desktop Chrome), then a plain video texture.
 *
 * 2. Quest plays ONE video at a time. Two 4K decodes do not gracefully
 *    degrade, they stutter or fail. That is enforced here rather than left to
 *    component discipline, because "remember to pause the other one" is not a
 *    mechanism.
 */

export type Projection = 'flat' | 'equirect' | 'equirect180'
export type Stereo = 'none' | 'top_bottom' | 'left_right'

export type LayerStrategy = 'media-layer' | 'polyfill-layer' | 'video-texture'

/** uikit/WebXR layout string for a stereo mode. */
export function stereoLayout(stereo: Stereo): 'mono' | 'stereo-top-bottom' | 'stereo-left-right' {
  switch (stereo) {
    case 'top_bottom':
      return 'stereo-top-bottom'
    case 'left_right':
      return 'stereo-left-right'
    default:
      return 'mono'
  }
}

/**
 * Pick the best available strategy.
 *
 * Passed the session explicitly rather than reaching for a global, so the
 * decision is testable without a headset.
 */
export function chooseStrategy(
  session: XRSession | null,
  hasMediaBinding: boolean,
  hasPolyfill: boolean,
): LayerStrategy {
  if (session && hasMediaBinding) return 'media-layer'
  if (session && hasPolyfill) return 'polyfill-layer'
  return 'video-texture'
}

/**
 * Which HLS rendition to request.
 *
 * Above 4K, only h.265 and AV1 decode on Quest -- and AV1 hardware decode is
 * not safe to assume on older Quest hardware, so h.265 is the ceiling we
 * actually rely on.
 */
export function preferredCodec(
  height: number,
  support: { h265: boolean; av1: boolean },
): 'h264' | 'h265' | 'av1' {
  if (height <= 2160) return 'h264'
  if (support.h265) return 'h265'
  if (support.av1) return 'av1'
  return 'h264' // will be downscaled; better than a black screen
}

/**
 * Enforces one playing video at a time.
 *
 * Registering a new video pauses whatever was playing. There is no way to have
 * two playing through this class, which is the point.
 */
export class SingleVideoPlayback {
  #current: HTMLVideoElement | null = null

  get current(): HTMLVideoElement | null {
    return this.#current
  }

  async play(video: HTMLVideoElement): Promise<void> {
    if (this.#current && this.#current !== video) {
      this.#current.pause()
      // Release the decoder rather than leaving a paused 4K stream resident.
      this.#current.removeAttribute('src')
      this.#current.load()
    }
    this.#current = video
    await video.play()
  }

  pause(): void {
    this.#current?.pause()
  }

  release(): void {
    this.pause()
    this.#current = null
  }
}

/**
 * Attach a video to an XR layer.
 *
 * Returns a teardown function. Null means layers were unavailable and the
 * caller should fall back to a video texture on a sphere or plane.
 */
export async function createVideoLayer(
  session: XRSession,
  video: HTMLVideoElement,
  projection: Projection,
  stereo: Stereo,
): Promise<{ layer: XRLayer; dispose: () => void } | null> {
  const MediaBinding = (
    globalThis as unknown as { XRMediaBinding?: new (session: XRSession) => XRMediaBinding }
  ).XRMediaBinding
  if (!MediaBinding) return null

  const binding = new MediaBinding(session)
  const space = await session.requestReferenceSpace('local')
  const layout = stereoLayout(stereo)

  const layer =
    projection === 'flat'
      ? binding.createQuadLayer(video, {
          space,
          layout,
          // 1.5 m out: inside the 0.75-5 m comfort band and far enough that a
          // large panel does not force vergence-accommodation conflict.
          transform: new XRRigidTransform({ x: 0, y: 1.4, z: -1.5 }),
          width: 1.2,
          height: 0.675,
        })
      : binding.createEquirectLayer(video, {
          space,
          layout,
          transform: new XRRigidTransform({ x: 0, y: 0, z: 0 }),
          radius: 0,
          centralHorizontalAngle: projection === 'equirect180' ? Math.PI : 2 * Math.PI,
          upperVerticalAngle: Math.PI / 2,
          lowerVerticalAngle: -Math.PI / 2,
        })

  const previous = session.renderState.layers ?? []
  session.updateRenderState({ layers: [layer, ...previous] })

  return {
    layer,
    dispose: () => {
      session.updateRenderState({ layers: previous })
      layer.destroy?.()
    },
  }
}
