import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { Lang } from './api'
import { STRINGS, type StringKey } from './strings'

const STORAGE_KEY = 'cropscan_lang'

interface LanguageValue {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
  t: (key: StringKey) => string
}

const LanguageContext = createContext<LanguageValue | null>(null)

function readStored(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'te' ? 'te' : 'en'
  } catch {
    return 'en'
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing. The choice just does not persist; nothing breaks.
    }
    document.documentElement.lang = next
  }, [])

  const value = useMemo<LanguageValue>(
    () => ({
      lang,
      setLang,
      toggle: () => setLang(lang === 'en' ? 'te' : 'en'),
      t: (key: StringKey) => STRINGS[key][lang],
    }),
    [lang, setLang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang(): LanguageValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider')
  return ctx
}
