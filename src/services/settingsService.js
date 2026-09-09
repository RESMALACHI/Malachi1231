import { supabase } from '../lib/supabaseClient'

/** Pages hidden from navigation (array of page keys). Empty on any error. */
export async function getHiddenPages() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'nav')
    .maybeSingle()

  if (error) throw error
  const hidden = data?.value?.hidden
  return Array.isArray(hidden) ? hidden : []
}

/**
 * The speech script ("ספיץ") per language, as raw line-format text. Missing
 * languages come back undefined and the page falls back to the built-in
 * default for that one — so adding a language never blanks the other.
 */
export async function getSpeech() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'speech')
    .maybeSingle()

  if (error) throw error
  const v = data?.value
  if (!v) return {}

  const str = (x) => (typeof x === 'string' && x.trim() ? x : undefined)
  // `value.text` is the single-language shape this setting had before Arabic
  // existed. Read as Hebrew rather than discarded, so a script the manager
  // already wrote survives the upgrade.
  return { he: str(v.he) ?? str(v.text), ar: str(v.ar) }
}

/** Persist the speech scripts (shared — the whole team reads one pitch). */
export async function saveSpeech(byLang) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'speech', value: byLang, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) throw error
}

/**
 * Team targets. Currently one number: how many meetings a day each agent is
 * expected to book. Shared, so "the goal" means the same thing to everyone.
 */
export async function getGoals() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'goals')
    .maybeSingle()

  if (error) throw error
  const n = Number(data?.value?.dailyBookings)
  return { dailyBookings: Number.isFinite(n) && n > 0 ? Math.round(n) : null }
}

export async function saveGoals(goals) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'goals', value: goals, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) throw error
}

/**
 * The office, for the "open my day summary when I leave" option.
 *
 * Seeded on ראש פינה so the feature is usable before anyone configures it, but
 * the town centre is not the car park — the ניהול page has a button that sets
 * this from the admin's own position while they are standing at the branch.
 */
export const DEFAULT_OFFICE = {
  label: 'ראש פינה',
  lat: 32.9686,
  lng: 35.5425,
  radiusM: 300,
  // 0 = any hour. The reminder fires on the crossing out of the radius and
  // re-arms on the way back in (see useAutoDaySummary), so a lunch trip costs
  // one notification rather than the whole day's only chance to ask.
  afterHour: 0,
}

export async function getOffice() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'office')
    .maybeSingle()

  if (error) throw error
  const v = data?.value || {}
  const num = (x, fallback) => (Number.isFinite(Number(x)) ? Number(x) : fallback)
  return {
    label: typeof v.label === 'string' && v.label.trim() ? v.label : DEFAULT_OFFICE.label,
    lat: num(v.lat, DEFAULT_OFFICE.lat),
    lng: num(v.lng, DEFAULT_OFFICE.lng),
    radiusM: Math.max(50, num(v.radiusM, DEFAULT_OFFICE.radiusM)),
    afterHour: Math.min(23, Math.max(0, num(v.afterHour, DEFAULT_OFFICE.afterHour))),
  }
}

export async function saveOffice(office) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'office', value: office, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) throw error
}

/** Persist the hidden-pages list (shared across all users). */
export async function saveHiddenPages(hidden) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'nav', value: { hidden }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) throw error
}
