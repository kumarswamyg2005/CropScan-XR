import { useQuery } from '@tanstack/react-query'

import { ErrorNote, Loading } from '../components/Status'
import { api, shortHash } from '../lib/api'
import { useLang } from '../lib/lang'
import { token } from '../tokens'

export default function LedgerPage() {
  const { t } = useLang()

  const entries = useQuery({ queryKey: ['ledger'], queryFn: () => api.readLedger(0, 50) })
  const stats = useQuery({ queryKey: ['ledgerStats'], queryFn: api.ledgerStats })

  // Not on mount: verification walks the whole chain, and it is the user's
  // action that makes the point -- press the button, watch it check.
  const verify = useQuery({
    queryKey: ['ledgerVerify'],
    queryFn: api.verifyLedger,
    enabled: false,
  })

  if (entries.isPending) return <Loading />
  if (entries.isError) return <ErrorNote message={String(entries.error)} />

  return (
    <div className="py-10">
      <h1 className="text-xl">{t('ledgerTitle')}</h1>
      <p className="mt-3 max-w-2xl">{t('ledgerIntro')}</p>

      <div className="plate mt-6 p-4">
        <button
          type="button"
          onClick={() => void verify.refetch()}
          disabled={verify.isFetching}
          className="border border-ink bg-ink px-4 py-2 text-sheet disabled:opacity-50"
        >
          {verify.isFetching ? `${t('loading')}…` : t('verifyChain')}
        </button>

        {verify.data && (
          <div className="mt-4" role="status">
            <p
              className="text-md"
              style={{ color: token(verify.data.ok ? 'chlorophyll' : 'necrosis') }}
            >
              {verify.data.ok ? t('chainIntact') : t('chainBroken')}
            </p>
            <p className="determination">
              {verify.data.checked} {t('entriesChecked')}
            </p>
            {verify.data.first_break && (
              <dl className="determination mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-rule pt-3">
                <dt>seq</dt>
                <dd className="m-0 text-ink">{verify.data.first_break.seq}</dd>
                <dt>reason</dt>
                <dd className="m-0 text-ink">{verify.data.first_break.reason}</dd>
                <dt>detail</dt>
                <dd className="m-0 text-ink">{verify.data.first_break.detail}</dd>
              </dl>
            )}
          </div>
        )}

        {stats.data && (
          <dl className="determination mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-rule pt-3">
            <dt>entries</dt>
            <dd className="m-0 text-ink">{stats.data.entries}</dd>
            <dt>head</dt>
            <dd className="m-0 break-all text-ink">{shortHash(stats.data.head_hash)}</dd>
          </dl>
        )}
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="determination w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">{t('ledgerTitle')}</caption>
          <thead>
            <tr className="border-b border-ink text-left">
              <th scope="col" className="py-2 pr-3 font-medium">seq</th>
              <th scope="col" className="py-2 pr-3 font-medium">event</th>
              <th scope="col" className="py-2 pr-3 font-medium">subject</th>
              <th scope="col" className="py-2 pr-3 font-medium">prev</th>
              <th scope="col" className="py-2 font-medium">hash</th>
            </tr>
          </thead>
          <tbody>
            {entries.data.map((entry) => (
              <tr key={entry.id} className="border-b border-rule">
                <td className="py-1.5 pr-3 text-ink">{entry.seq}</td>
                <td className="py-1.5 pr-3">{entry.event_type}</td>
                <td className="py-1.5 pr-3">{shortHash(entry.subject_id)}</td>
                <td className="py-1.5 pr-3">{shortHash(entry.prev_hash)}</td>
                <td className="py-1.5 text-ink">{shortHash(entry.entry_hash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
