/** Typed API client. No `any` anywhere. */

export type ScanStatus = 'ok' | 'uncertain'
export type Lang = 'en' | 'te'

export interface TopK {
  disease_id: string
  confidence: number
}

export interface DiseaseInfo {
  name: string
  plant: string
  is_healthy: boolean
  severity?: string
  symptoms?: string
  organic?: string
  chemical?: string
  prevention?: string
}

export interface Scan {
  id: string
  created_at: string
  status: ScanStatus
  disease_id: string | null
  confidence: number | null
  top3: TopK[]
  model_version: string
  image_url: string | null
  gradcam_url: string | null
  info: DiseaseInfo | null
  has_cycle: boolean
  can_enter_field: boolean
  field_blocked_reason: string | null
}

export interface DiseaseSummary {
  id: string
  name: string
  plant: string
  is_healthy: boolean
  severity: string | null
  has_cycle: boolean
  has_video: boolean
}

export interface CycleRequires {
  temp_c: [number, number] | null
  leaf_wetness_hr: [number, number] | null
  rh_pct: [number, number] | null
}

export interface CycleStage {
  id: string
  label: string
  label_te: string
  what_happens: string
  duration_hint: string
  requires: CycleRequires
  visible: boolean
  vfx: string
}

export interface EnvBand {
  min: number | null
  optimal: number | null
  max: number | null
}

export interface Intervention {
  stage_id: string
  action: string
  effect: 'blocks' | 'reduces_inoculum' | 'slows'
  kind: 'cultural' | 'chemical' | 'biological' | 'resistant_variety'
}

export interface DiseaseCycle {
  pathogen: { name: string; type: string }
  primary_inoculum: string
  overseasoning: string
  cycle_type: 'polycyclic' | 'monocyclic'
  dispersal: string[]
  stages: CycleStage[]
  environment: {
    temp_c: EnvBand | null
    leaf_wetness_hr: EnvBand | null
    rh_pct: EnvBand | null
  }
  interventions: Intervention[]
  sources: string[]
  vector?: { name: string; transmission: string } | null
  alternate_host?: string | null
  note?: string | null
}

export interface Video {
  id: string
  disease_id: string
  kind: 'treatment' | 'field360' | 'symptom_closeup'
  title: string
  hls_url: string | null
  poster_url: string | null
  duration_s: number | null
  projection: 'flat' | 'equirect' | 'equirect180'
  stereo: 'none' | 'top_bottom' | 'left_right'
  language: string
}

export interface DiseaseDetail extends DiseaseSummary {
  symptoms: string | null
  organic: string | null
  chemical: string | null
  prevention: string | null
  cycle: DiseaseCycle | null
  videos: Video[]
}

export interface LedgerEntry {
  id: string
  seq: number
  created_at: string
  event_type: string
  subject_id: string
  payload: Record<string, unknown>
  payload_sha256: string
  prev_hash: string
  entry_hash: string
}

export interface LedgerVerify {
  ok: boolean
  checked: number
  head_hash: string | null
  first_break: {
    id: string
    seq: number
    event_type: string
    subject_id: string
    reason: string
    detail: string
  } | null
}

export interface LedgerStats {
  entries: number
  head_seq: number
  head_hash: string
}

export interface Order {
  id: string
  status: 'created' | 'paid' | 'failed' | 'refunded'
  amount_paise: number
  currency: string
  rzp_order_id: string | null
  rzp_key_id: string | null
  product_title: string | null
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init)
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body: unknown = await response.json()
      if (body && typeof body === 'object' && 'detail' in body) {
        detail = String((body as { detail: unknown }).detail)
      }
    } catch {
      // A non-JSON error body is still an error; the status carries the meaning.
    }
    throw new ApiError(response.status, detail)
  }
  return (await response.json()) as T
}

export const api = {
  createScan(file: File, lang: Lang): Promise<Scan> {
    const form = new FormData()
    form.append('file', file)
    return request<Scan>(`/api/scans?lang=${lang}`, { method: 'POST', body: form })
  },

  getScan: (id: string, lang: Lang) => request<Scan>(`/api/scans/${id}?lang=${lang}`),

  listDiseases: (params: { crop?: string; hasCycle?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (params.crop) q.set('crop', params.crop)
    if (params.hasCycle !== undefined) q.set('has_cycle', String(params.hasCycle))
    return request<DiseaseSummary[]>(`/api/diseases?${q}`)
  },

  getDisease: (id: string, lang: Lang) =>
    request<DiseaseDetail>(`/api/diseases/${encodeURIComponent(id)}?lang=${lang}`),

  getCycle: (id: string, lang: Lang) =>
    request<{ disease_id: string; cycle: DiseaseCycle | null }>(
      `/api/diseases/${encodeURIComponent(id)}/cycle?lang=${lang}`,
    ),

  listVideos: (diseaseId: string, lang: Lang) =>
    request<Video[]>(`/api/videos?disease_id=${encodeURIComponent(diseaseId)}&lang=${lang}`),

  readLedger: (sinceSeq = 0, limit = 50) =>
    request<LedgerEntry[]>(`/api/ledger?since_seq=${sinceSeq}&limit=${limit}`),

  verifyLedger: () => request<LedgerVerify>('/api/ledger/verify'),
  ledgerStats: () => request<LedgerStats>('/api/ledger/stats'),

  createOrder: (productId: string, scanId?: string) =>
    request<Order>('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product_id: productId, scan_id: scanId ?? null }),
    }),

  getOrder: (id: string) => request<Order>(`/api/orders/${id}`),
}

/** Integer paise to a rupee string. Money never touches a float. */
export function formatPaise(paise: number): string {
  const rupees = Math.trunc(paise / 100)
  const remainder = String(paise % 100).padStart(2, '0')
  return `₹${rupees.toLocaleString('en-IN')}.${remainder}`
}

/** First and last six of a hash, for the determination label. */
export function shortHash(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 6)}…${hash.slice(-6)}`
}
