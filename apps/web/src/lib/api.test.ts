import { describe, expect, it } from 'vitest'

import { formatPaise, shortHash } from './api'

describe('formatPaise', () => {
  it('never touches a float', () => {
    // Money is integer paise end to end. 149900 / 100 in floating point is the
    // classic way a receipt ends up reading 1498.99.
    expect(formatPaise(149900)).toBe('₹1,499.00')
  })

  it('pads the paise', () => {
    expect(formatPaise(1005)).toBe('₹10.05')
    expect(formatPaise(1050)).toBe('₹10.50')
  })

  it('handles amounts under a rupee', () => {
    expect(formatPaise(7)).toBe('₹0.07')
  })

  it('groups in the Indian system', () => {
    expect(formatPaise(1234567800)).toBe('₹1,23,45,678.00')
  })
})

describe('shortHash', () => {
  it('abbreviates a sha256', () => {
    const hash = 'a'.repeat(32) + 'b'.repeat(32)
    expect(shortHash(hash)).toBe('aaaaaa…bbbbbb')
  })

  it('leaves a short id alone', () => {
    expect(shortHash('abc123')).toBe('abc123')
  })
})
