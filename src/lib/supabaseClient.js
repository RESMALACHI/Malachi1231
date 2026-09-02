import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Surface a clear message instead of a cryptic crash when env vars are missing.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[meeting-tracker] Supabase env vars missing. Copy .env.example to .env ' +
      'and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

// Fallback placeholders keep createClient from throwing so the login screen can
// still render (and show a helpful message) before the app is configured.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)
