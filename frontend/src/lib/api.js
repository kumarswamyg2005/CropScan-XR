/**
 * API client.
 *
 * The backend moved from /predict to /api/scans during the rebuild. Rather
 * than rewrite Result.jsx, `adaptScan` maps the new response onto the shape
 * the page already renders — class_name, confidence as a percentage, top3 —
 * and carries the genuinely new fields alongside it.
 */

const BASE = import.meta.env.VITE_API_URL || ''

async function request(path, init) {
  const response = await fetch(`${BASE}${path}`, init)
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      // Non-JSON error body; the status is the message.
    }
    const error = new Error(detail)
    error.status = response.status
    throw error
  }
  return response.json()
}

/** New ScanOut -> the shape Result.jsx already expects, plus the new fields. */
export function adaptScan(scan) {
  return {
    // what the existing page reads
    class_name: scan.disease_id || scan.top3?.[0]?.disease_id || '',
    confidence: (scan.confidence ?? 0) * 100,
    top3: (scan.top3 || []).map((t) => ({
      class_name: t.disease_id,
      name: t.name, // already in the requested language
      confidence: t.confidence * 100,
    })),
    disease_info: scan.info,
    disease_info_te: null, // the API already resolves language server-side

    // new
    id: scan.id,
    status: scan.status,
    modelVersion: scan.model_version,
    gradcamUrl: scan.gradcam_url,
    storedImageUrl: scan.image_url,
    hasCycle: scan.has_cycle,
    canEnterField: scan.can_enter_field,
    fieldBlockedReason: scan.field_blocked_reason,
  }
}

export const api = {
  async createScan(file, lang = 'en', crop = '') {
    const form = new FormData()
    form.append('file', file)
    // crop: the plant the farmer picked; '' lets every crop compete
    const q = crop ? `&crop=${encodeURIComponent(crop)}` : ''
    const scan = await request(`/api/scans?lang=${lang}${q}`, { method: 'POST', body: form })
    return adaptScan(scan)
  },

  async getScan(id, lang = 'en') {
    return adaptScan(await request(`/api/scans/${id}?lang=${lang}`))
  },

  listDiseases: (params = {}) => {
    const q = new URLSearchParams()
    if (params.lang) q.set('lang', params.lang)
    if (params.crop) q.set('crop', params.crop)
    if (params.hasCycle !== undefined) q.set('has_cycle', String(params.hasCycle))
    return request(`/api/diseases?${q}`)
  },

  getDisease: (id, lang = 'en') =>
    request(`/api/diseases/${encodeURIComponent(id)}?lang=${lang}`),

  getCycle: (id, lang = 'en') =>
    request(`/api/diseases/${encodeURIComponent(id)}/cycle?lang=${lang}`),

  listVideos: (diseaseId, lang = 'en') =>
    request(`/api/videos?disease_id=${encodeURIComponent(diseaseId)}&lang=${lang}`),

  health: () => request('/healthz'),

  /** Deployed model's measured metrics, from its meta.json. 503 when none. */
  model: () => request('/api/model'),
}
