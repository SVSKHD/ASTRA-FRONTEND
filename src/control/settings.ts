// Runtime settings and secrets (backend docs/settings.md): the pure half of the
// Settings module, so every chip can be tested without a server.
//
// Nothing here ever holds a value. The server sends masks ("••••abcd"), where a
// value comes from (db / env / default / unset), and connection-test outcomes;
// a typed value lives only in the component's input until it is sent, and is
// never written to localStorage, sessionStorage or a VITE_ variable.
import type { Schemas } from '@/control/api'

export type SettingRow = Schemas['SettingOut']
export type SettingsList = Schemas['SettingsOut']
export type TestResult = Schemas['TestResultOut']

export const CATEGORY_LABEL: Record<string, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Claude — Anthropic API',
  gemini: 'Gemini — Google API',
  ai: 'AI — global controls',
  agents: 'Agents',
  dhan: 'Dhan',
  github: 'GitHub',
  discord: 'Discord',
  mt5: 'MT5',
}

// The direct providers (backend docs/26): usable only when enabled, with a key, a
// default model, a daily cap above 0 and a price for the model.
const DIRECT =
  'External models through the provider’s own API, behind the server’s privacy check. The key is used server-side only. Usable when enabled, with a key, a default model, a daily cap above 0 and a price for that model; an unpriced model is never used. Turn it on after Test passes.'

export const CATEGORY_NOTE: Record<string, string> = {
  openrouter: 'External models. The key is used server-side only.',
  anthropic: `${DIRECT} Needs an Anthropic Console API key, not a Claude subscription login.`,
  gemini: `${DIRECT} Needs a Google AI Studio API key.`,
  ai: 'Shared by every external provider: the provider for new chats and “auto” agents, a cap on total external spend, and limits per call. Local Ollama stays the default and the only fallback.',
  agents:
    'Which provider each agent uses. Voice speech recognition and synthesis always stay local; finance, broker and private data always stay local.',
  dhan: 'Broker API, read-only. Log in with the API key (above); the manual access token is only a fallback.',
  github: 'Token for the GitHub modules and the coding agent.',
  discord: 'Where alerts and approval requests are posted.',
  mt5: 'The token the MT5 bot pushes with.',
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export interface Chip {
  label: string
  tone: Tone
}

/** Where the value in effect comes from. */
export function sourceChip(row: SettingRow): Chip {
  switch (row.source) {
    case 'db':
      return { label: 'Set', tone: 'success' }
    case 'env':
      return { label: 'From .env', tone: 'info' }
    case 'default':
      return { label: 'Default', tone: 'neutral' }
    default:
      return { label: 'Not set', tone: 'warning' }
  }
}

/** The Dhan token's own expiry: expired, expiring inside the warning window, or nothing. */
export function expiryChip(row: SettingRow, now = Date.now()): Chip | null {
  if (!row.expires_at) return null
  const at = Date.parse(row.expires_at)
  if (Number.isNaN(at)) return null
  if (at <= now) return { label: 'Expired', tone: 'danger' }
  if (row.expires_soon) return { label: 'Expires soon', tone: 'warning' }
  return null
}

/** The group's last connection test. */
export function testChip(result: TestResult | undefined): Chip | null {
  if (!result) return null
  return result.ok
    ? { label: 'Test OK', tone: 'success' }
    : { label: 'Test failed', tone: 'danger' }
}

export interface Group {
  category: string
  label: string
  note: string
  rows: SettingRow[]
  test?: TestResult
}

/** The settings grouped in the server's category order. */
export function groupSettings(list: SettingsList): Group[] {
  return list.categories.map((category) => ({
    category,
    label: CATEGORY_LABEL[category] ?? category,
    note: CATEGORY_NOTE[category] ?? '',
    rows: list.settings.filter((s) => s.category === category),
    test: list.tests[category],
  }))
}

/** The setting a group's Test button exercises: its first secret, else its first key. */
export function testKey(group: Group): string | undefined {
  return (group.rows.find((r) => r.is_secret) ?? group.rows[0])?.key
}

const ERRORS: Record<string, string> = {
  reauth_failed: 'That password was not accepted.',
  too_many_reauth_failures: 'Too many wrong passwords. Wait 15 minutes and try again.',
  rate_limited: 'Too many changes in a short time. Try again in a few minutes.',
  settings_key_missing: 'The server has no SETTINGS_MASTER_KEY, so nothing can be stored yet.',
  settings_key_invalid: 'The server’s SETTINGS_MASTER_KEY is not valid.',
  bootstrap_key: 'That key can only be set in the server’s .env.',
  not_in_db: 'It already comes from .env.',
}

/** A message for a refusal; the server's own detail never contains a value. */
export function refusal(code: string, detail: string | undefined, fallback: string): string {
  return ERRORS[code] ?? detail ?? fallback
}
