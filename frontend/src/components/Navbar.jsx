import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { useLang } from '../context/LanguageContext'
import { LANGS } from '../i18n'

const links = [
  { to: '/', key: 'nav.home' },
  { to: '/detect', key: 'nav.detect' },
  { to: '/field', key: 'nav.field' },
  { to: '/about', key: 'nav.about' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const { lang, setLang, t } = useLang()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--color-surface)',
        borderBottom: `1px solid var(--color-border)`,
        boxShadow: scrolled ? '0 4px 24px rgba(30,26,20,0.08)' : 'none',
        transition: 'box-shadow 0.3s',
      }}
    >
      {/* One row on desktop. On a phone the links drop to a second, scrollable
          row so nothing overflows the viewport. */}
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-x-2 px-4 py-2 sm:h-16 sm:px-6 sm:py-0">
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #40916C, #1B4332)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 17,
            boxShadow: '0 2px 8px rgba(45,106,79,0.3)',
          }} aria-hidden="true">🌿</div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.05rem',
              color: 'var(--color-accent)',
              lineHeight: 1,
            }}>CropScan</div>
            <div className="label-caps" style={{ fontSize: '0.58rem' }}>
              {t('nav.subtitle')}
            </div>
          </div>
        </Link>

        <div className="order-2 flex items-center gap-2 sm:order-3">
          <select
            className="lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            aria-label={t('nav.language')}
          >
            {LANGS.map(({ code, name }) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <Link
            to="/detect"
            className="btn-primary hidden sm:inline-flex"
            style={{ padding: '8px 20px', fontSize: '0.85rem' }}
          >
            {t('nav.tryNow')} →
          </Link>
        </div>

        <div className="order-3 -mx-1 mt-1 flex w-full gap-1 overflow-x-auto pb-1 sm:order-2 sm:mx-0 sm:mt-0 sm:w-auto sm:pb-0">
          {links.map(({ to, key }) => (
            <Link
              key={to}
              to={to}
              className="nav-link"
              aria-current={pathname === to ? 'page' : undefined}
            >
              {t(key)}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
