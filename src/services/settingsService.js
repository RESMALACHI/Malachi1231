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
