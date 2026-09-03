import { useQuery } from '@tanstack/react-query'

import { useLang } from '../lib/lang'
import { token } from '../tokens'

interface ModelCard {
  available: boolean
  model_name?: string
  model_version?: string
  trained_at?: string
  num_classes?: number
  metrics?: {
    lab_acc: number
    field_acc: number
    macro_f1_field: number
    ece: number
    domain_gap: number
    background_probe_ratio: number
  }
  confidence_threshold?: number
  entropy_threshold?: number
}

/**
 * The honest methodology page.
 *
 * Every number here is served from the deployed model's meta.json, not typed
 * into the markup, so the site cannot claim a figure the model does not have.
 * Stating the field-accuracy gap plainly is the most credible thing on the
 * whole site -- this page is not filler (issue #31).
 */
export default function AboutPage() {
  const { t } = useLang()
  const query = useQuery<ModelCard>({
    queryKey: ['modelCard'],
    queryFn: async () => {
      const response = await fetch('/api/model')
      return (await response.json()) as ModelCard
    },
  })

  const metrics = query.data?.metrics

  return (
    <div className="py-10">
      <h1 className="text-xl max-w-2xl">{t('aboutTitle')}</h1>

      <section className="mt-8">
        <h2 className="text-lg">The headline is the field number</h2>
        <p className="mt-2 max-w-2xl">
          PlantVillage is 54,306 images shot on uniform backgrounds in controlled
          conditions. Models trained on it routinely collapse outdoors: 99.35% to
          31.4% in Ferentinos (2018), 99.72% to 41.81% in Gui et al. (2021).
          Analysis shows such models frequently key on the <em>background</em>, not
          the lesion. So this model is trained on a lab-plus-field mixture, and the
          number we lead with is held-out field accuracy.
        </p>

        {metrics ? (
          <dl className="determination mt-6 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2">
            <dt className="!text-ink text-base">{t('fieldAccuracy')}</dt>
            <dd
              className="m-0 text-right text-base"
              style={{ color: token('chlorophyll') }}
            >
              {(metrics.field_acc * 100).toFixed(1)}%
            </dd>

            <dt className="border-t border-rule pt-2">{t('labAccuracy')}</dt>
            <dd className="m-0 border-t border-rule pt-2 text-right text-ink">
              {(metrics.lab_acc * 100).toFixed(1)}%
            </dd>

            <dt>{t('domainGap')}</dt>
            <dd className="m-0 text-right" style={{ color: token('necrosis') }}>
              {(metrics.domain_gap * 100).toFixed(1)} points
            </dd>

            <dt>macro-F1 (field)</dt>
            <dd className="m-0 text-right text-ink">{metrics.macro_f1_field.toFixed(3)}</dd>

            <dt>calibration error (ECE)</dt>
            <dd className="m-0 text-right text-ink">{metrics.ece.toFixed(4)}</dd>

            <dt>background probe</dt>
            <dd className="m-0 text-right text-ink">
              {metrics.background_probe_ratio.toFixed(2)}× chance
            </dd>
          </dl>
        ) : (
          <p className="determination mt-6">
            No model is deployed, so there are no numbers to show. This page will
            not display a figure the running model cannot back.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg">The background-bias probe</h2>
        <p className="mt-2 max-w-2xl">
          We score the field test set a second time with the leaf masked out and
          only the background left. A model that reads lesions should be at
          chance. Whatever it scores above chance is accuracy that is not coming
          from the plant, and it is published above either way.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg">When it declines to answer</h2>
        <p className="mt-2 max-w-2xl">
          Below the confidence and entropy thresholds the API returns no
          diagnosis at all, and the field module refuses to launch. This is
          deliberate: a confident wrong answer is what costs a farmer a spray,
          and narrating a pathogen life cycle for the wrong pathogen is the worst
          thing this system could do.
        </p>
        {query.data?.confidence_threshold !== undefined && (
          <p className="determination mt-3">
            max-softmax ≥ {query.data.confidence_threshold.toFixed(3)} · entropy ≤{' '}
            {query.data.entropy_threshold?.toFixed(3)}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg">What this cannot do</h2>
        <ul className="mt-2 max-w-2xl list-disc space-y-2 pl-5">
          <li>
            It covers 38 classes across a limited set of crops. Anything outside
            them will either be refused or confidently misfiled as the nearest
            class it knows.
          </li>
          <li>
            Disease cycles are written up for apple, tomato and potato only.
            Other diagnoses return no cycle and cannot enter the field module.
          </li>
          <li>
            Treatment text is general guidance, not a prescription. Local
            resistance, registration and pre-harvest intervals vary, and a wrong
            fungicide timing is a real cost.
          </li>
          <li>
            The ledger proves a record has not been altered since it was written.
            It does not prove the diagnosis was correct.
          </li>
          <li>Payments run in Razorpay test mode. Nothing is really charged.</li>
        </ul>
      </section>

      {query.data?.model_version && (
        <p className="determination mt-10 border-t border-rule pt-4">
          {query.data.model_version} · {query.data.num_classes} classes ·{' '}
          {query.data.trained_at?.slice(0, 10)}
        </p>
      )}
    </div>
  )
}
