import { supabase } from '../lib/supabaseClient'

// All calls go through the `crm-proxy` Edge Function, which holds the CRM
// (Bambi) credentials server-side. The browser only sends the action + params.
async function call(payload) {
  const { data, error } = await supabase.functions.invoke('crm-proxy', { body: payload })
  if (error) {
    let detail = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) detail = ctx.detail ? `${ctx.error} · ${ctx.detail}` : ctx.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return data
}

/** Whether the CRM credentials are configured server-side. */
export const crmStatus = () => call({ action: 'status' })

/** Search clients by phone / name / email. → { configured, clients: [...] } */
export const searchClients = (query) => call({ action: 'search', query })

/** A client's open/closed CRM tasks. → { tasks: [...] } */
export const getClientTasks = (clientId) => call({ action: 'tasks', clientId })

/** Create a new task for a client. */
export const insertTask = (clientId, task) =>
  call({ action: 'insert_task', clientId, task })

/** Mark a task completed. */
export const setTaskCompleted = (taskId) => call({ action: 'complete_task', taskId })

/** Update a task (title / due date / status …). */
export const updateTask = (taskId, patch) => call({ action: 'update_task', taskId, patch })
