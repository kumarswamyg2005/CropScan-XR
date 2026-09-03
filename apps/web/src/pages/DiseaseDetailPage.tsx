import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import CycleStages from '../components/CycleStages'
import SeverityScale from '../components/SeverityScale'
import { ErrorNote, Loading, NotFound } from '../components/Status'
import { api } from '../lib/api'
import { useLang } from '../lib/lang'

export default function DiseaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang } = useLang()

  const query = useQuery({
    queryKey: ['disease', id, lang],
    queryFn: () => api.getDisease(id!, lang),
    enabled: Boolean(id),
  })

  if (query.isPending) return <Loading />
  if (query.isError) return <ErrorNote message={String(query.error)} />
  if (!query.data) return <NotFound />

  const disease = query.data
  const sections: Array<[string, string | null]> = [
    [t('symptoms'), disease.symptoms],
    [t('organic'), disease.organic],
    [t('chemical'), disease.chemical],
    [t('prevention'), disease.prevention],
  ]

  return (
    <div className="py-10">
      <p className="determination">{disease.plant}</p>
      <h1 className="text-xl">{disease.name}</h1>

      {!disease.is_healthy && (
        <div className="mt-4 max-w-sm">
          <SeverityScale severity={disease.severity} label={disease.severity ?? '—'} />
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {sections.map(([heading, body]) =>
          body ? (
            <section key={heading}>
              <h2 className="determination !text-ink border-b border-rule pb-1">{heading}</h2>
              <p className="mt-2">{body}</p>
            </section>
          ) : null,
        )}
      </div>

      {disease.videos.length > 0 && (
        <section className="mt-8">
          <h2 className="determination !text-ink border-b border-rule pb-1">
            {t('navField')}
          </h2>
          <ul className="determination mt-2 list-none space-y-1 p-0">
            {disease.videos.map((video) => (
              <li key={video.id} className="flex justify-between border-b border-rule py-1">
                <span className="text-ink">{video.title}</span>
                <span>
                  {video.projection} · {video.duration_s ?? '—'}s
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {disease.cycle ? (
        <>
          <CycleStages cycle={disease.cycle} />
          <Link
            to={`/field?disease=${encodeURIComponent(disease.id)}`}
            className="mt-6 inline-block border border-ink bg-ink px-4 py-2 text-sheet"
          >
            {t('enterField')}
          </Link>
        </>
      ) : (
        !disease.is_healthy && (
          <p className="determination mt-8 border-t border-rule pt-4">{t('noCycleYet')}</p>
        )
      )}
    </div>
  )
}
