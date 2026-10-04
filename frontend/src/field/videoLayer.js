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
 *    GPU texture every frame. @react-three/xr's <XRLayer> picks the layer and
 *    falls back to a textured mesh on its own (FieldScene.jsx).
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
