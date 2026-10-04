import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { isLang, translate } from '../i18n'

export const LanguageContext = createContext(null)

const STORAGE_KEY = 'cropscan_lang'

/** Saved choice first, then the browser's own preference, then English. */
function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // Private browsing. Fall through to the browser preference.
  }
  const preferred = (navigator.languages ?? [navigator.language])
    .map((l) => String(l).slice(0, 2).toLowerCase())
    .find(isLang)
  return preferred ?? 'en'
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)

  const setLang = useCallback((next) => {
    if (!isLang(next)) return
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing. The choice just does not persist; nothing breaks.
    }
  }, [])

  // Screen readers pick their voice from this, and :lang() CSS keys off it.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider')
  return ctx
}
