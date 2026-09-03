import { createContext, useContext, useState, useCallback } from 'react'

const LanguageContext = createContext(null)

const STORAGE_KEY = 'cropscan_lang'

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved === 'te' ? 'te' : 'en'
    } catch {
      return 'en'
    }
  })

  const toggle = useCallback(() => {
    setLang(prev => {
      const next = prev === 'en' ? 'te' : 'en'
      try { localStorage.setItem(STORAGE_KEY, next) } catch {}
      return next
    })
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, toggle }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider')
  return ctx
}
