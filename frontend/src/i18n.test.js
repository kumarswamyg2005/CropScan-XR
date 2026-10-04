import { describe, expect, it } from 'vitest'

import { LANGS, STRINGS, translate } from './i18n'

const placeholders = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

describe('locales', () => {
  const en = STRINGS.en

  it('has a file for every language offered', () => {
    expect(Object.keys(STRINGS).sort()).toEqual(LANGS.map((l) => l.code).sort())
  })

  for (const { code } of LANGS.filter((l) => l.code !== 'en')) {
    it(`${code} carries every English key, non-empty, with the same placeholders`, () => {
      const strings = STRINGS[code]
      for (const [key, value] of Object.entries(en)) {
        expect(strings[key], `${code} is missing ${key}`).toBeTruthy()
        expect(placeholders(strings[key]), `${code} ${key}`).toBe(placeholders(value))
      }
      expect(Object.keys(strings).filter((k) => !(k in en)), `${code} has keys English lacks`).toEqual([])
    })
  }
})

describe('translate', () => {
  it('fills placeholders and falls back to English, then the key', () => {
    expect(translate('hi', 'about.nDiseases', { n: 3 })).toBe('3 रोग')
    expect(translate('xx', 'nav.home')).toBe('Home')
    expect(translate('te', 'no.such.key')).toBe('no.such.key')
  })
})
