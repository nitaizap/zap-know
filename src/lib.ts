import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://lfiwdqcysgwvzzfuuszf.supabase.co'
// Publishable key: safe in the browser, every table is behind RLS.
export const SUPABASE_KEY = 'sb_publishable_QHNRy4_uXFZuJkwHI9uAzg_yaxi4hUM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export const ALLOWED_DOMAIN = '@d.co.il'

export type Topic = { slug: string; name_he: string; blurb_he: string | null; status: 'live' | 'soon'; sort: number }

export type Lesson = { title_he: string; title_orig?: string; minutes?: number }

export type Item = {
  id: number
  kind: 'course' | 'news' | 'internal' | 'podcast'
  topic_slug: string | null
  verticals: string[]
  title_he: string
  title_orig: string | null
  summary_he: string | null
  why_he: string | null
  lesson_plan: Lesson[]
  source_name: string
  source_url: string
  published_at: string | null
  summarized_at: string | null
  ai_summarized: boolean
  status: 'pending' | 'approved' | 'rejected' | 'broken'
  hot_week: string | null
  opens: number
  saves: number
  is_demo: boolean
  created_at: string
  thumbnail_url?: string | null
  preview_video_id?: string | null
  minutes?: number | null
  likes?: number
  audio_url?: string | null
}

export type TeamProfile = {
  id: number
  team: string
  vertical: string | null
  summary_he: string
  tools: { name: string; what_for_he?: string }[]
  resources: { name: string; url: string; system?: string }[]
  processes_he: string | null
  contact_name: string | null
  contact_email: string | null
  is_demo: boolean
  confirmed_at: string | null
  updated_at: string
}

export type Profile = {
  user_id: string
  email: string
  display_name: string | null
  role: string | null
  topics: string[]
  is_admin: boolean
  manager_email?: string | null
  needs?: string[]
  needs_note?: string | null
  avatar_url?: string | null
  avatar_style?: string | null
  avatar_color?: string | null
  weekly_time?: string | null
}

export type Source = {
  id: number
  name: string
  kind: string
  ref: string
  topic_slug: string | null
  status: 'active' | 'proposed' | 'dropped'
  score: number
  reason_he: string | null
}

export type Budget = {
  monthly_amount: number
  currency: string
  is_placeholder: boolean
  spent: number
  remaining: number
  pending: number
  bonus?: number
}

export type PurchaseStatus = 'auto_approved' | 'pending_manager' | 'approved' | 'declined' | 'purchased'
export type PurchaseCategory = 'course' | 'book' | 'tool' | 'event'

export type Purchase = {
  id: number
  user_id?: string
  title: string
  url: string
  category: PurchaseCategory
  price: number
  currency: string
  status: PurchaseStatus
  manager_email: string | null
  created_at: string
  is_demo: boolean
}

export const CATEGORY_LABEL: Record<PurchaseCategory, string> = {
  course: 'קורס', book: 'ספר', tool: 'כלי', event: 'כנס או אירוע',
}

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  auto_approved: 'אושר אוטומטית',
  pending_manager: 'מחכה למנהל/ת',
  approved: 'אושר',
  declined: 'לא אושר',
  purchased: 'נקנה',
}

export function fmtMoney(n: number, currency = 'ILS'): string {
  const v = Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })
  return currency === 'ILS' ? `₪${v}` : `${v} ${currency}`
}

// Null when the budget isn't set up yet (the card simply doesn't show).
export async function loadBudget(): Promise<Budget | null> {
  const { data, error } = await supabase.rpc('my_budget')
  if (error || !data) return null
  return data as Budget
}

export type PurchaseResult = { status: PurchaseStatus; purchase_id: number; remaining: number; currency: string }

export const ROLES = ['שיווק', 'PPC', 'סושיאל', 'מכירות', 'מוצר', 'פיתוח', 'דאטה', 'שירות לקוחות', 'HR', 'אחר']

export const VERTICALS = ['zap', 'zapstore', 'Wisebuy', 'דפי זהב', 'Doctors', 'משפטי', 'REST', 'Weekend', 'zapX', 'zap לעסקים']

export const KIND_LABEL: Record<Item['kind'], string> = { course: 'קורס', news: 'עדכון', internal: 'קורה ב-zap', podcast: 'פודקאסט' }

// Sunday of the current week (the Israeli work week), as YYYY-MM-DD; matches items.hot_week.
export function weekStart(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  x.setUTCDate(x.getUTCDate() - x.getUTCDay())
  return x.toISOString().slice(0, 10)
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

const BASE_COLS =
  'id,kind,topic_slug,verticals,title_he,title_orig,summary_he,why_he,lesson_plan,source_name,source_url,published_at,summarized_at,ai_summarized,status,hot_week,opens,saves,is_demo,created_at'

// Media columns (thumbnail, YouTube preview) are newer; include them only once the database has
// them, so an older schema never breaks a page. ITEM_COLS is a live binding: probeMediaCols()
// upgrades it for every importer.
export let ITEM_COLS: typeof BASE_COLS = BASE_COLS
const OPTIONAL_COLS = ['thumbnail_url,preview_video_id', 'minutes', 'likes', 'audio_url']
export async function probeMediaCols() {
  const ok = await Promise.all(OPTIONAL_COLS.map(async (c) => !(await supabase.from('items').select(c).limit(1)).error))
  const extra = OPTIONAL_COLS.filter((_, n) => ok[n])
  // Typed as the base list so supabase-js keeps inferring rows; the extra fields are optional on Item.
  ITEM_COLS = [BASE_COLS, ...extra].join(',') as typeof BASE_COLS
  return ok.every(Boolean)
}

// "5 דק'" / "1:20 שע'", for cards and filters.
export function fmtMinutes(m: number | null | undefined): string {
  if (!m) return ''
  if (m < 60) return `${m} דק'`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}:${String(r).padStart(2, '0')} שע'` : `${h} שע'`
}

// Calls a Supabase edge function with the signed-in user's token.
export async function callFn<T>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw Object.assign(new Error(`${name} ${res.status}`), { status: res.status })
  return (await res.json()) as T
}

export function track(itemId: number, type: 'open' | 'save' | 'click_source') {
  supabase.rpc('track', { p_item: itemId, p_type: type }).then(() => {}, () => {})
}

// What people need at work right now (asked at onboarding, editable in "ההעדפות שלי").
export const NEEDS = [
  'להתחיל בתפקיד חדש',
  'לשפר תוצאות בקמפיינים',
  'להבין AI ולהשתמש בו',
  'לעבוד עם דאטה',
  'להציג ולשכנע',
  'לנהל זמן ותעדוף',
  'להכיר את המותגים של zap',
  'משהו אחר',
]
