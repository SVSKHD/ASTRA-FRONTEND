// Writing one runtime setting (backend docs/settings.md): one write path and one
// re-auth flow for the Settings page.
//
// A typed value lives only in `drafts` (component memory) until it is sent, and
// is dropped after: never localStorage, sessionStorage, IndexedDB, a persisted
// store or a VITE_ variable, and never logged. Keys that need it (secrets, the
// URLs a credential goes to) ask for the admin's password first; the server
// checks it, audits the change by key name and applies it without a restart.
//
// A key is "unsaved" while it has a draft — even an empty one, because blank is a
// real value for some settings (a schedule or the router model: blank = off).
import { computed, reactive, ref } from 'vue'
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

/** Settings where an empty value means "off" rather than "nothing typed yet". */
export function blankAllowed(row: Pick<SettingRow, 'key' | 'kind'>): boolean {
  return (
    ['csv', 'json_list'].includes(row.kind) ||
    row.key.endsWith('_CRON') ||
    row.key === 'AI_MODEL_ROUTER'
  )
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

  /** Keys with an unsaved draft, in the order they were first edited. */
  const dirty = computed(() => Object.keys(drafts))

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

  function edit(key: string, value: string) {
    drafts[key] = value
  }
  function discard(key: string) {
    delete drafts[key]
  }
  function discardAll() {
    for (const k of Object.keys(drafts)) delete drafts[k]
  }

  /** Save the draft, or `value` when the editor produced one directly. */
  function save(row: Row, value?: string): Promise<boolean> {
    const v = value ?? drafts[row.key]
    if (v === undefined) return Promise.resolve(false)
    if (!v.trim() && !blankAllowed(row)) return Promise.resolve(false)
    const p: Pending = { action: 'save', row, value: v }
    if (row.requires_reauth) {
      pending.value = p
      return Promise.resolve(false)
    }
    return send(p)
  }

  function revert(row: Row): Promise<boolean> {
    if (row.requires_reauth) {
      pending.value = { action: 'revert', row }
      return Promise.resolve(false)
    }
    return send({ action: 'revert', row })
  }

  async function send(p: Pending, pass?: string): Promise<boolean> {
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
        return true
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
      return false
    } catch {
      closeReauth()
      say(key, 'The server could not be reached.', 'error')
      return false
    } finally {
      busy.value = ''
    }
  }

  function confirmReauth() {
    if (pending.value && password.value) void send(pending.value, password.value)
  }

  /**
   * Save every draft that needs no password (the unsaved-changes sheet's Save).
   * True when nothing is left unsaved; drafts that need a password stay.
   */
  async function saveAll(rows: Row[]): Promise<boolean> {
    for (const key of [...dirty.value]) {
      const row = rows.find((r) => r.key === key)
      if (!row || row.requires_reauth) continue
      await save(row)
    }
    return dirty.value.length === 0
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
    dirty,
    busy,
    message,
    pending,
    password,
    reauthError,
    say,
    edit,
    discard,
    discardAll,
    save,
    saveAll,
    revert,
    send,
    closeReauth,
    confirmReauth,
    runTest,
  }
}

export type SettingWriter = ReturnType<typeof useSettingWriter>
