import { Link, useLocation } from 'react-router-dom'

import { useLang } from '../context/LanguageContext'

/**
 * Catch-all. Without this, an unknown URL matches no route and React Router
 * renders nothing: the navbar stays, the page body is empty, and it looks
 * exactly like the app crashed.
 */
export default function NotFound() {
  const { pathname } = useLocation()
  const { lang } = useLang()

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: 'var(--space-3xl) var(--space-lg)' }}>
      <div className="label-caps" style={{ marginBottom: 8 }}>404</div>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 34, margin: '0 0 12px' }}>
        {lang === 'te' ? 'ఈ పేజీ కనిపించలేదు' : 'That page does not exist'}
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>
        {lang === 'te' ? 'మీరు వెతికిన చిరునామా:' : 'Nothing is routed at'}
      </p>
      <code style={{
        display: 'inline-block',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '4px 10px',
        fontFamily: "'DM Mono', monospace",
        fontSize: 13,
        marginBottom: 28,
      }}>
        {pathname}
      </code>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/" className="btn-primary">
          {lang === 'te' ? 'హోమ్‌కి వెళ్ళండి' : 'Back to home'}
        </Link>
        <Link to="/detect" className="btn-secondary">
          {lang === 'te' ? 'ఆకును స్కాన్ చేయండి' : 'Scan a leaf'}
        </Link>
      </div>
    </div>
  )
}
