import { Link } from 'react-router-dom'

import { useLang } from '../lib/lang'

/**
 * The hero is a live specimen with a determination label, not a headline slab.
 * The sentence that would have been the headline is the caption underneath,
 * where it describes something real (docs/design_plan.md section 6).
 */
export default function Landing() {
  const { t } = useLang()

  return (
    <div className="py-10 sm:py-16">
      <div className="grid gap-8 sm:grid-cols-[3fr_2fr] sm:items-end">
        <figure className="m-0">
          <div className="plate aspect-[4/3] overflow-hidden">
            <img
              src="/specimen.jpg"
              alt="An apple leaf showing olive-green scab lesions, mounted for examination"
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
        </figure>

        <div className="plate p-4">
          <p className="determination !text-ink border-b border-rule pb-1">
            {t('determination')}
          </p>
          <p className="mt-3 text-md leading-tight">Apple scab</p>
          <p className="determination">
            <em>Venturia inaequalis</em>
          </p>
          <dl className="determination mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>{t('confidence')}</dt>
            <dd className="m-0 text-right text-ink">0.941</dd>
            <dt>{t('cycleType')}</dt>
            <dd className="m-0 text-right text-ink">polycyclic</dd>
            <dt>seq</dt>
            <dd className="m-0 text-right text-ink">1284</dd>
          </dl>
        </div>
      </div>

      <p className="mt-6 max-w-2xl text-md">{t('heroCaption')}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/scan" className="border border-ink bg-ink px-4 py-2 text-sheet">
          {t('startScan')}
        </Link>
        <Link to="/diseases" className="border border-ink px-4 py-2">
          {t('browseDiseases')}
        </Link>
      </div>

      <p className="determination mt-10 max-w-2xl border-t border-rule pt-4">
        <Link to="/about" className="underline underline-offset-2">
          {t('aboutTitle')}
        </Link>
      </p>
    </div>
  )
}
