// Writing one runtime setting (backend docs/settings.md), shared by the Settings
// page and the agents hub so there is one write path and one re-auth flow.
//
// A typed value lives only in `drafts` (component memory) until it is sent, and
// is dropped after: never localStorage, sessionStorage, IndexedDB, a persisted
// store or a VITE_ variable, and never logged. Keys that need it (secrets, the
// URLs a credential goes to) ask for the admin's password first; the server
// checks it, audits the change by key name and applies it without a restart.
import { reactive, ref } from 'vue'
import { aureon } from '@/api/client'
import { codeOf } from '@/control/api'
import { refusal, type SettingRow } from '@/control/settings'

type Row = Pick<SettingRow, 'key' | 'kind' | 'requires_reauth'>
export type Pending = { action: 'save' | 'revert'; row: Row; value?: string }

function detailOf(error: unknown): string | undefined {
  const d = (error as { detail?: unknown } | undefined)?.detail
  if (d && typeof d === 'object' && 'detail' in d && typeof d.detail === 'string') return d.detail
  return undefined
}

export function useSettingWriter(onChanged: () => unknown) {
  // Typed values, keyed by setting. Memory only; cleared after every send.
  const drafts = reactive<Record<string, string>>({})
  const busy = ref('')
  const message = reactive<{ key: string; text: string; tone: 'ok' | 'error' }>({
    key: '',
    text: '',
    tone: 'ok',
  })
  // The re-auth dialog: what is waiting for the password.
  const pending = ref<Pending | null>(null)
  const password = ref('')
  const reauthError = ref('')

  function say(key: string, text: string, tone: 'ok' | 'error' = 'ok') {
    message.key = key
    message.text = text
    message.tone = tone
  }

  function closeReauth() {
    pending.value = null
    password.value = ''
    reauthError.value = ''
  }

  /** Save the draft, or `value` when the editor produced one (a switch, a select, prices). */
  function save(row: Row, value?: string) {
    const v = value ?? drafts[row.key] ?? ''
    if (!v.trim() && !['csv', 'json_list'].includes(row.kind)) return
    const p: Pending = { action: 'save', row, value: v }
    if (row.requires_reauth) pending.value = p
    else void send(p)
  }

  function revert(row: Row) {
    if (row.requires_reauth) pending.value = { action: 'revert', row }
    else void send({ action: 'revert', row })
  }

  async function send(p: Pending, pass?: string) {
    const key = p.row.key
    busy.value = key
    reauthError.value = ''
    try {
      const params = { path: { key } }
      const r =
        p.action === 'save'
          ? await aureon.PUT('/api/v1/settings/{key}', {
              params,
              body: { value: p.value ?? '', ...(pass ? { password: pass } : {}) },
            })
          : await aureon.DELETE('/api/v1/settings/{key}', {
              params,
              ...(pass ? { body: { password: pass } } : {}),
            })
      if (r.data) {
        delete drafts[key]
        closeReauth()
        say(key, p.action === 'save' ? 'Saved. Applied without a restart.' : 'Reverted to .env.')
        await onChanged()
        return
      }
      const code = codeOf(r.error)
      const text = refusal(code, detailOf(r.error), 'That change was refused.')
      if (pending.value && (code === 'reauth_failed' || code === 'too_many_reauth_failures')) {
        reauthError.value = text
        password.value = ''
      } else {
        closeReauth()
        say(key, text, 'error')
      }
    } catch {
      closeReauth()
      say(key, 'The server could not be reached.', 'error')
    } finally {
      busy.value = ''
    }
  }

  function confirmReauth() {
    if (pending.value && password.value) void send(pending.value, password.value)
  }

  /**
   * The category's connection test, run by the server (POST /settings/{key}/test).
   * The browser never calls a provider itself.
   */
  async function runTest(key: string, busyKey: string) {
    busy.value = busyKey
    try {
      const r = await aureon.POST('/api/v1/settings/{key}/test', { params: { path: { key } } })
      if (r.data) say(key, r.data.detail, r.data.ok ? 'ok' : 'error')
      else say(key, refusal(codeOf(r.error), detailOf(r.error), 'The test could not run.'), 'error')
      await onChanged()
    } catch {
      say(key, 'The server could not be reached.', 'error')
    } finally {
      busy.value = ''
    }
  }

  return {
    drafts,
    busy,
    message,
    pending,
    password,
    reauthError,
    say,
    save,
    revert,
    send,
    closeReauth,
    confirmReauth,
    runTest,
  }
}

export type SettingWriter = ReturnType<typeof useSettingWriter>
