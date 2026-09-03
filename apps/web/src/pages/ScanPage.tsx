import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { api, ApiError } from '../lib/api'
import { useLang } from '../lib/lang'
import { ErrorNote } from '../components/Status'

/**
 * Camera-first on mobile. The photo guidance sits beside the drop zone rather
 * than behind a tooltip, because it directly lowers the abstain rate -- it is
 * primary content, not help text (issue #31).
 */
export default function ScanPage() {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const scan = useMutation({
    mutationFn: (file: File) => api.createScan(file, lang),
    onSuccess: (result) => navigate(`/scan/${result.id}`),
  })

  function submit(files: FileList | null) {
    const file = files?.[0]
    if (file) scan.mutate(file)
  }

  const guidance = [
    t('guidanceFillFrame'),
    t('guidanceLight'),
    t('guidanceBacking'),
    t('guidanceFocus'),
  ]

  return (
    <div className="py-10">
      <h1 className="text-xl">{t('navScan')}</h1>

      <div className="mt-6 grid gap-6 sm:grid-cols-[3fr_2fr]">
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              submit(e.dataTransfer.files)
            }}
            className={`flex aspect-[4/3] items-center justify-center border-2 border-dashed bg-sheet ${
              dragging ? 'border-ink' : 'border-rule'
            }`}
          >
            <p className="determination px-6 text-center">
              {scan.isPending ? `${t('analysing')}…` : t('mountSpecimen')}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraInput.current?.click()}
              disabled={scan.isPending}
              className="border border-ink bg-ink px-4 py-2 text-sheet disabled:opacity-50"
            >
              {t('capture')}
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={scan.isPending}
              className="border border-ink px-4 py-2 disabled:opacity-50"
            >
              {t('choosePhoto')}
            </button>
          </div>

          {/* capture="environment" opens the rear camera directly on a phone. */}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={t('capture')}
            onChange={(e) => submit(e.target.files)}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t('choosePhoto')}
            onChange={(e) => submit(e.target.files)}
          />
        </div>

        <aside className="plate p-4">
          <h2 className="determination !text-ink border-b border-rule pb-1">
            {t('mountSpecimen')}
          </h2>
          <ol className="mt-3 list-none space-y-2 p-0 text-sm">
            {guidance.map((line, i) => (
              <li key={line} className="flex gap-2">
                <span className="determination">{String(i + 1).padStart(2, '0')}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <p className="determination mt-4 border-t border-rule pt-3">{t('guidanceWhy')}</p>
        </aside>
      </div>

      {scan.isError && (
        <ErrorNote
          message={
            scan.error instanceof ApiError ? scan.error.message : String(scan.error)
          }
          onRetry={() => scan.reset()}
        />
      )}
    </div>
  )
}
