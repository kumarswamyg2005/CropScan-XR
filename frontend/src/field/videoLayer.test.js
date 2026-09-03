import { describe, expect, it, vi } from 'vitest'

import { SingleVideoPlayback, chooseStrategy, preferredCodec, sphereArc, stereoLayout } from './videoLayer'

describe('stereoLayout', () => {
  it('maps the database values to WebXR layouts', () => {
    expect(stereoLayout('none')).toBe('mono')
    expect(stereoLayout('top_bottom')).toBe('stereo-top-bottom')
    expect(stereoLayout('left_right')).toBe('stereo-left-right')
  })
})

describe('sphereArc', () => {
  it('wraps a full sphere for 360 and a half for 180', () => {
    expect(sphereArc('equirect')).toBeCloseTo(Math.PI * 2)
    expect(sphereArc('equirect180')).toBeCloseTo(Math.PI)
  })
})

describe('chooseStrategy', () => {
  it('prefers a native media layer in a session', () => {
    expect(chooseStrategy({}, true, true)).toBe('media-layer')
  })

  it('falls back to the polyfill, which is what makes desktop dev possible', () => {
    expect(chooseStrategy({}, false, true)).toBe('polyfill-layer')
  })

  it('falls back to a video texture with no layer support at all', () => {
    expect(chooseStrategy({}, false, false)).toBe('video-texture')
  })

  it('uses a video texture outside a session, however capable the browser is', () => {
    expect(chooseStrategy(null, true, true)).toBe('video-texture')
  })
})

describe('preferredCodec', () => {
  it('uses h.264 up to 4K, which every Quest decodes', () => {
    expect(preferredCodec(1080, { h265: true, av1: true })).toBe('h264')
    expect(preferredCodec(2160, { h265: true, av1: true })).toBe('h264')
  })

  it('needs h.265 or AV1 above 4K', () => {
    expect(preferredCodec(4320, { h265: true, av1: true })).toBe('h265')
    expect(preferredCodec(4320, { h265: false, av1: true })).toBe('av1')
  })

  it('does not assume AV1 hardware decode when h.265 is available', () => {
    // Older Quest hardware has no AV1 hardware decode path.
    expect(preferredCodec(5760, { h265: true, av1: true })).toBe('h265')
  })

  it('degrades to h.264 rather than showing a black screen', () => {
    expect(preferredCodec(4320, { h265: false, av1: false })).toBe('h264')
  })
})

function fakeVideo() {
  return { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() }
}

describe('SingleVideoPlayback', () => {
  it('pauses the previous video when a second one starts', async () => {
    // Quest plays one video at a time. Two 4K decodes do not degrade
    // gracefully, they stutter or fail outright.
    const manager = new SingleVideoPlayback()
    const a = fakeVideo()
    const b = fakeVideo()
    await manager.play(a)
    await manager.play(b)
    expect(a.pause).toHaveBeenCalled()
    expect(b.play).toHaveBeenCalled()
    expect(manager.current).toBe(b)
  })

  it('releases the decoder rather than leaving a paused stream resident', async () => {
    const manager = new SingleVideoPlayback()
    const a = fakeVideo()
    await manager.play(a)
    await manager.play(fakeVideo())
    expect(a.removeAttribute).toHaveBeenCalledWith('src')
    expect(a.load).toHaveBeenCalled()
  })

  it('replaying the same video does not tear it down', async () => {
    const manager = new SingleVideoPlayback()
    const a = fakeVideo()
    await manager.play(a)
    await manager.play(a)
    expect(a.pause).not.toHaveBeenCalled()
    expect(a.play).toHaveBeenCalledTimes(2)
  })

  it('release clears the current video', async () => {
    const manager = new SingleVideoPlayback()
    const a = fakeVideo()
    await manager.play(a)
    manager.release()
    expect(a.pause).toHaveBeenCalled()
    expect(manager.current).toBeNull()
  })
})
