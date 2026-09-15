// Backups — the `backup` edge function (migration 0018) and its settings.

import { supabase } from '../lib/supabaseClient'

async function backupFn(body) {
  const { data, error } = await supabase.functions.invoke('backup', { body })
  if (!error) return data
  let detail = null
  try {
    detail = await error.context?.json?.()
  } catch {
    /* not JSON */
  }
  throw new Error(detail?.error || error.message || 'הפעולה נכשלה')
}

/** { last, list: [{ name, size, at }], settings: { email, weekly } } */
export const backupStatus = () => backupFn({ action: 'status' })

/** A backup now — and, with `email`, its copy to the backup address. */
export const runBackup = ({ email = false, agent } = {}) => backupFn({ action: 'run', email, agent })

/** A five-minute link that downloads one saved backup. */
export const backupDownloadUrl = async (name) => (await backupFn({ action: 'download', name })).url

export async function saveBackupSettings({ email, weekly }) {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'backup_settings', value: { email: email.trim(), weekly: !!weekly }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  if (error) throw error
}
