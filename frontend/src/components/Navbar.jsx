import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useLang } from '../context/LanguageContext'

const links = [
  { to: '/', label: 'Home' },
  { to: '/detect', label: 'Detect' },
  { to: '/about', label: 'About' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const { lang, toggle } = useLang()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll)
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
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '0 24px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
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
          }}>🌿</div>
          <div>
            <div style={{
              fontFamily: '"Playfair Display", serif',
              fontWeight: 700,
              fontSize: '1.05rem',
              color: 'var(--color-accent)',
              lineHeight: 1,
            }}>CropScan</div>
            <div style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '0.58rem',
              letterSpacing: '0.12em',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
            }}>Disease Detector</div>
          </div>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {links.map(({ to, label }) => {
            const active = pathname === to
            return (
              <Link
                key={to}
                to={to}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  background: active ? 'var(--color-accent-subtle)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (!active) { e.target.style.background = 'var(--color-surface-raised)'; e.target.style.color = 'var(--color-text)' } }}
                onMouseLeave={e => { if (!active) { e.target.style.background = 'transparent'; e.target.style.color = 'var(--color-text-muted)' } }}
              >
                {label}
              </Link>
            )
          })}
          {/* Language toggle */}
          <button
            onClick={toggle}
            title={lang === 'en' ? 'Switch to Telugu' : 'Switch to English'}
            style={{
              marginLeft: 8,
              padding: '7px 14px',
              borderRadius: 8,
              border: '1.5px solid var(--color-border)',
              background: lang === 'te' ? 'var(--color-accent-subtle)' : 'transparent',
              color: lang === 'te' ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontFamily: lang === 'te' ? '"DM Sans", sans-serif' : '"DM Mono", monospace',
              fontSize: lang === 'te' ? '0.8rem' : '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: lang === 'te' ? 0 : '0.05em',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'en' ? 'తె' : 'EN'}
          </button>

          <Link
            to="/detect"
            className="btn-primary"
            style={{ marginLeft: 8, padding: '8px 20px', fontSize: '0.85rem' }}
          >
            Try Now →
          </Link>
        </div>
      </div>
    </nav>
  )
}
