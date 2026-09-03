import { Link } from 'react-router-dom'

import { useLang } from '../lib/lang'

export function Loading() {
  const { t } = useLang()
  return (
    <p className="determination py-16 text-center" role="status">
      {t('loading')}…
    </p>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useLang()
  return (
    <div className="plate my-8 p-5" role="alert">
      <h2 className="text-md">{t('errorTitle')}</h2>
      <p className="determination mt-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 border border-ink px-3 py-1.5 text-sm">
          {t('tryAgain')}
        </button>
      )}
    </div>
  )
}

export function NotFound() {
  const { t } = useLang()
  return (
    <div className="py-20 text-center">
      <h1 className="text-xl">{t('notFound')}</h1>
      <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
        {t('backHome')}
      </Link>
    </div>
  )
}
