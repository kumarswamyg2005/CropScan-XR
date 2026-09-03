import { useState } from 'react'

import { useLang } from '../lib/lang'

/**
 * The specimen: the user's photo with the Grad-CAM overlay toggled over it.
 *
 * This is the one bold thing on the page. Everything around it stays quiet.
 * The crossfade between photo and attention is the single orchestrated moment
 * in the whole app -- it shows what changed, which is the only justification
 * for motion here.
 */
export default function Specimen({
  imageUrl,
  gradcamUrl,
  alt,
}: {
  imageUrl: string | null
  gradcamUrl: string | null
  alt: string
}) {
  const { t } = useLang()
  const [showAttention, setShowAttention] = useState(false)

  return (
    <figure className="m-0">
      <div className="plate relative aspect-[4/3] overflow-hidden">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={alt} className="h-full w-full object-cover" />
            {gradcamUrl && (
              <img
                src={gradcamUrl}
                alt={`${alt} — ${t('attention')}`}
                aria-hidden={!showAttention}
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                // Computed value: opacity is state, not a design constant.
                style={{ opacity: showAttention ? 1 : 0 }}
              />
            )}
          </>
        ) : (
          <div className="determination flex h-full items-center justify-center">—</div>
        )}
      </div>

      {gradcamUrl && (
        <figcaption className="mt-2 flex gap-1" role="group" aria-label={t('attention')}>
          <button
            type="button"
            onClick={() => setShowAttention(false)}
            aria-pressed={!showAttention}
            className={`border px-3 py-1 text-sm ${
              showAttention ? 'border-rule text-ink-soft' : 'border-ink text-ink'
            }`}
          >
            {t('photo')}
          </button>
          <button
            type="button"
            onClick={() => setShowAttention(true)}
            aria-pressed={showAttention}
            className={`border px-3 py-1 text-sm ${
              showAttention ? 'border-ink text-ink' : 'border-rule text-ink-soft'
            }`}
          >
            {t('attention')}
          </button>
        </figcaption>
      )}
    </figure>
  )
}
