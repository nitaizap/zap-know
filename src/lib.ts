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
  kind: 'course' | 'news' | 'internal'
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

export const ROLES = ['שיווק', 'PPC', 'סושיאל', 'מכירות', 'מוצר', 'פיתוח', 'דאטה', 'שירות לקוחות', 'HR', 'אחר']

export const VERTICALS = ['zap', 'zapstore', 'Wisebuy', 'דפי זהב', 'Doctors', 'משפטי', 'REST', 'Weekend', 'zapX', 'zap לעסקים']

export const KIND_LABEL: Record<Item['kind'], string> = { course: 'קורס', news: 'עדכון', internal: 'קורה ב-zap' }

// Monday of the current week, as YYYY-MM-DD (matches items.hot_week).
export function weekStart(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() - day + 1)
  return x.toISOString().slice(0, 10)
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

export const ITEM_COLS =
  'id,kind,topic_slug,verticals,title_he,title_orig,summary_he,why_he,lesson_plan,source_name,source_url,published_at,summarized_at,ai_summarized,status,hot_week,opens,saves,is_demo,created_at'

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
  if (!res.ok) throw new Error(`${name} ${res.status}`)
  return (await res.json()) as T
}

export function track(itemId: number, type: 'open' | 'save' | 'click_source') {
  supabase.rpc('track', { p_item: itemId, p_type: type }).then(() => {}, () => {})
}
