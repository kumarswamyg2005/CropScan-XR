import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { api } from '../lib/api'
import { useLang } from '../lib/lang'
import { ErrorNote, Loading } from '../components/Status'
import { severityToken, token } from '../tokens'

export default function DiseasesPage() {
  const { t } = useLang()
  const [crop, setCrop] = useState('')

  const query = useQuery({ queryKey: ['diseases'], queryFn: () => api.listDiseases() })

  const crops = useMemo(
    () => [...new Set((query.data ?? []).map((d) => d.plant))].sort(),
    [query.data],
  )
  const rows = (query.data ?? []).filter((d) => !crop || d.plant === crop)

  if (query.isPending) return <Loading />
  if (query.isError) return <ErrorNote message={String(query.error)} />

  return (
    <div className="py-10">
      <h1 className="text-xl">{t('navDiseases')}</h1>

      <label className="determination mt-4 flex w-fit items-center gap-2">
        <span>{t('allCrops')}</span>
        <select
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
          className="border border-rule bg-sheet px-2 py-1 text-ink"
        >
          <option value="">{t('allCrops')}</option>
          {crops.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <ul className="mt-6 list-none p-0">
        {rows.map((disease) => (
          <li key={disease.id} className="border-t border-rule">
            <Link
              to={`/diseases/${encodeURIComponent(disease.id)}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 border border-rule"
                style={{
                  background: disease.is_healthy
                    ? token('chlorophyll')
                    : token(severityToken(disease.severity)),
                }}
              />
              <span className="text-md">{disease.name}</span>
              <span className="determination">{disease.plant}</span>
              <span className="determination ml-auto flex gap-3">
                {disease.has_cycle && <span>cycle</span>}
                {disease.has_video && <span>video</span>}
                {disease.severity && <span>{disease.severity}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="determination mt-4 border-t border-rule pt-3">{rows.length} / 38</p>
    </div>
  )
}
