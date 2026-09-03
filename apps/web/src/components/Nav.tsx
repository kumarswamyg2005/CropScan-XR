import { NavLink } from 'react-router-dom'

import { useLang } from '../lib/lang'

const LINKS = [
  { to: '/scan', key: 'navScan' },
  { to: '/diseases', key: 'navDiseases' },
  { to: '/field', key: 'navField' },
  { to: '/ledger', key: 'navLedger' },
  { to: '/about', key: 'navAbout' },
] as const

export default function Nav() {
  const { t, lang, setLang } = useLang()

  return (
    <header className="border-b border-rule">
      <nav
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6"
        aria-label="Primary"
      >
        <NavLink to="/" className="mr-auto font-semibold tracking-tight">
          {t('appName')}
        </NavLink>

        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `text-sm ${isActive ? 'text-ink underline underline-offset-4' : 'text-ink-soft hover:text-ink'}`
            }
          >
            {t(link.key)}
          </NavLink>
        ))}

        {/* Two buttons, not a toggle: the current language is stated, not implied
            by a switch position, and each option is separately reachable. */}
        <div className="determination flex items-center gap-1" role="group" aria-label="Language">
          <button
            type="button"
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
            className={lang === 'en' ? 'text-ink underline underline-offset-2' : 'hover:text-ink'}
          >
            EN
          </button>
          <span aria-hidden="true">|</span>
          <button
            type="button"
            onClick={() => setLang('te')}
            aria-pressed={lang === 'te'}
            className={lang === 'te' ? 'text-ink underline underline-offset-2' : 'hover:text-ink'}
          >
            TE
          </button>
        </div>
      </nav>
    </header>
  )
}
