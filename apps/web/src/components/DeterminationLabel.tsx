import { Link } from 'react-router-dom'

import { shortHash, type Scan } from '../lib/api'
import { useLang } from '../lib/lang'
import { confidenceToken, token } from '../tokens'

/**
 * The determination label from a herbarium sheet, made literal: what it is,
 * how sure, which model, and the ledger record that proves when.
 *
 * This is also the ledger receipt. One component, two jobs -- the alternative
 * was a separate receipt card restating the same six fields.
 */
export default function DeterminationLabel({
  scan,
  ledgerSeq,
}: {
  scan: Scan
  ledgerSeq?: number
}) {
  const { t } = useLang()

  const rows: Array<[string, string]> = [
    [t('confidence'), scan.confidence === null ? '—' : scan.confidence.toFixed(3)],
    [t('model'), scan.model_version],
    [t('recorded'), new Date(scan.created_at).toISOString().slice(0, 16).replace('T', ' ')],
  ]
  if (ledgerSeq !== undefined) rows.push(['seq', String(ledgerSeq)])

  return (
    <aside className="plate p-4" aria-label={t('determination')}>
      <h2 className="determination !text-ink border-b border-rule pb-1">
        {t('determination')}
      </h2>

      {scan.status === 'ok' && scan.info ? (
        <>
          <p className="mt-3 text-md leading-tight">{scan.info.name}</p>
          <p className="determination">{scan.info.plant}</p>
          {scan.confidence !== null && (
            <div
              className="mt-3 h-1"
              role="img"
              aria-label={`${t('confidence')} ${(scan.confidence * 100).toFixed(0)}%`}
              style={{
                background: token(confidenceToken(scan.confidence)),
                width: `${Math.round(scan.confidence * 100)}%`,
              }}
            />
          )}
        </>
      ) : (
        <p className="mt-3 text-md leading-tight text-ink-soft">{t('uncertainTitle')}</p>
      )}

      <dl className="determination mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt>{key}</dt>
            <dd className="m-0 text-right break-all text-ink">{value}</dd>
          </div>
        ))}
        <dt>{t('specimenHash')}</dt>
        <dd className="m-0 text-right text-ink">{shortHash(scan.id)}</dd>
      </dl>

      <Link to="/ledger" className="determination mt-3 inline-block underline underline-offset-2">
        {t('navLedger')}
      </Link>
    </aside>
  )
}
