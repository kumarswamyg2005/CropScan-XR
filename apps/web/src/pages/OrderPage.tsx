import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { ErrorNote, Loading, NotFound } from '../components/Status'
import { api, formatPaise } from '../lib/api'
import { useLang } from '../lib/lang'
import { token } from '../tokens'

const STATUS_TOKEN = {
  paid: 'chlorophyll',
  created: 'ink-soft',
  failed: 'necrosis',
  refunded: 'sporulation',
} as const

export default function OrderPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useLang()

  const query = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.getOrder(id!),
    enabled: Boolean(id),
  })

  if (query.isPending) return <Loading />
  if (query.isError) return <ErrorNote message={String(query.error)} />
  if (!query.data) return <NotFound />

  const order = query.data

  return (
    <div className="py-10">
      <h1 className="text-xl">{order.product_title ?? t('navLedger')}</h1>

      <div className="plate mt-6 max-w-md p-4">
        <p className="determination !text-ink border-b border-rule pb-1">
          {t('determination')}
        </p>
        <dl className="determination mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>status</dt>
          <dd className="m-0 text-right" style={{ color: token(STATUS_TOKEN[order.status]) }}>
            {order.status}
          </dd>
          <dt>amount</dt>
          <dd className="m-0 text-right text-ink">{formatPaise(order.amount_paise)}</dd>
          <dt>order</dt>
          <dd className="m-0 break-all text-right text-ink">{order.id}</dd>
        </dl>
      </div>

      <Link to="/ledger" className="determination mt-6 inline-block underline underline-offset-2">
        {t('navLedger')}
      </Link>
    </div>
  )
}
