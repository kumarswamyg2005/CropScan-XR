import { describe, expect, it } from 'vitest'

import { wrapLines } from './textTexture'

const measure = (s) => s.length // one unit per character

describe('wrapLines', () => {
  it('breaks on spaces once a line would pass the width', () => {
    expect(wrapLines('the cycle stalls at germination', measure, 12))
      .toEqual(['the cycle', 'stalls at', 'germination'])
  })

  it('keeps a word longer than the width whole rather than splitting it', () => {
    expect(wrapLines('sporulation', measure, 4)).toEqual(['sporulation'])
  })

  it('honours explicit newlines and leaves an empty string as one empty line', () => {
    expect(wrapLines('a\nb', measure, 80)).toEqual(['a', 'b'])
    expect(wrapLines('', measure, 80)).toEqual([''])
  })
})
