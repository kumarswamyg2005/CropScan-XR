/**
 * Video for the field module.
 *
 * The XR module is a video theatre. That is a deliberate scoping decision:
 * a headset is genuinely good at 360 footage of a real diseased crop and
 * genuinely bad at procedural low-poly greenery, so the footage is the
 * experience and the disease-cycle logic rides on flat panels over it.
 *
 * Two platform facts drive this file:
 *
 * 1. WebXR Media Layers beat an in-scene video texture. The compositor samples
 *    the video once at full resolution instead of the app resampling it into a
 *    GPU texture every frame. Order: native XRMediaBinding, then the Layers
 *    polyfill (which is what makes this developable on desktop Chrome), then a
 *    plain video texture.
 *
 * 2. Quest plays ONE video at a time. Two 4K decodes do not degrade
 *    gracefully, they stutter or fail. Enforced here rather than left to
 *    component discipline, because "remember to pause the other one" is not a
 *    mechanism.
 */

/** uikit/WebXR layout string for a stereo mode. */
export function stereoLayout(stereo) {
  switch (stereo) {
    case 'top_bottom':
      return 'stereo-top-bottom'
    case 'left_right':
      return 'stereo-left-right'
    default:
      return 'mono'
  }
}

/** Best available strategy. Session passed in so the choice is testable. */
export function chooseStrategy(session, hasMediaBinding, hasPolyfill) {
  if (session && hasMediaBinding) return 'media-layer'
  if (session && hasPolyfill) return 'polyfill-layer'
  return 'video-texture'
}

/**
 * Which rendition to request. Above 4K only h.265 and AV1 decode on Quest, and
 * AV1 hardware decode is not safe to assume on older Quest hardware, so h.265
 * is the ceiling we actually rely on.
 */
export function preferredCodec(height, support) {
  if (height <= 2160) return 'h264'
  if (support.h265) return 'h265'
  if (support.av1) return 'av1'
  return 'h264' // will be downscaled; better than a black screen
}

/** Geometry for the sphere a 360 clip is painted on. */
export function sphereArc(projection) {
  return projection === 'equirect180' ? Math.PI : Math.PI * 2
}

/** Enforces one playing video at a time. */
export class SingleVideoPlayback {
  #current = null

  get current() {
    return this.#current
  }

  async play(video) {
    if (this.#current && this.#current !== video) {
      this.#current.pause()
      // Release the decoder rather than leaving a paused 4K stream resident.
      this.#current.removeAttribute('src')
      this.#current.load()
    }
    this.#current = video
    await video.play()
  }

  pause() {
    this.#current?.pause()
  }

  release() {
    this.pause()
    this.#current = null
  }
}

/**
 * Attach a video to an XR layer. Returns a teardown function, or null when
 * layers are unavailable and the caller should fall back to a video texture.
 */
export async function createVideoLayer(session, video, projection, stereo) {
  const MediaBinding = globalThis.XRMediaBinding
  if (!MediaBinding) return null

  const binding = new MediaBinding(session)
  const space = await session.requestReferenceSpace('local')
  const layout = stereoLayout(stereo)

  const layer =
    projection === 'flat'
      ? binding.createQuadLayer(video, {
          space,
          layout,
          // 1.5 m out: inside the 0.75-5 m comfort band, and far enough that a
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
          centralHorizontalAngle: sphereArc(projection),
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
