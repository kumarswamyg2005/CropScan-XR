import { Link, useLocation } from 'react-router-dom'

import { useLang } from '../context/LanguageContext'

/**
 * Catch-all. Without this, an unknown URL matches no route and React Router
 * renders nothing: the navbar stays, the page body is empty, and it looks
 * exactly like the app crashed.
 */
export default function NotFound() {
  const { pathname } = useLocation()
  const { t } = useLang()

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: 'var(--space-3xl) var(--space-lg)' }}>
      <div className="label-caps" style={{ marginBottom: 8 }}>404</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, margin: '0 0 12px' }}>
        {t('notFound.title')}
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>
        {t('notFound.body')}
      </p>
      <code style={{
        display: 'inline-block',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '4px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        marginBottom: 28,
      }}>
        {pathname}
      </code>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/" className="btn-primary">
          {t('notFound.home')}
        </Link>
        <Link to="/detect" className="btn-secondary">
          {t('notFound.scan')}
        </Link>
      </div>
    </div>
  )
}
