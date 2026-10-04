import en from './locales/en'
import te from './locales/te'
import hi from './locales/hi'
import ta from './locales/ta'
import kn from './locales/kn'

/** Every language the site and the API speak. `name` is how speakers write it. */
export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
]

export const STRINGS = { en, te, hi, ta, kn }

export const isLang = (code) => Object.hasOwn(STRINGS, code)

/**
 * Look up `key` in `lang`, falling back to English, then to the key itself so a
 * missing string is visible rather than blank. `{name}` placeholders are filled
 * from `vars`.
 */
export function translate(lang, key, vars) {
  const template = STRINGS[lang]?.[key] ?? en[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}
