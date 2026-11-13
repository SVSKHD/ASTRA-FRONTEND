// The Settings overview: one block per category, in the Dashboard's language — a
// figure, what it is out of, one line of status, and a hint in the corner. Pure,
// so every summary is tested without a server.
//
// Everything comes from what the server already sends: the settings list (is a
// key set, where a value comes from, when the Dhan session expires), the last
// connection test per category, and, for AI, this month's usage. No value is ever
// read — the server never sends one back.

import { levelOf, num, usd, type AiUsage } from '@/ai/costs'
import { modelName, modelNow } from '@/control/settingEditors'
import { missingCount, type Category, type SettingRow, type TestResult } from '@/control/settings'

export type BlockTone = 'ok' | 'warn' | 'bad' | 'idle'

export interface BlockSummary {
  /** The block's one figure, in mono: "$62.40", "Active", "Set". */
  figure: string
  /** What the figure is out of, or what it is: "of $100.00 this month". */
  of: string
  /** One line of status under it. */
  note: string
  /** Top-right corner: a short count or state ("2 missing", "Test OK"). */
  hint: string
  tone: BlockTone
  /** 0–100 when the block has a meter (AI spend), else null. */
  meter: number | null
}

function row(c: Category, key: string): SettingRow | undefined {
  return c.rows.find((r) => r.key === key)
}

function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (!Number.isFinite(mins)) return ''
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

/** "Test OK 2h ago" / "Test failed 1d ago" / "" (never tested). */
export function testLine(t: TestResult | undefined, now = Date.now()): string {
  if (!t) return ''
  return `Test ${t.ok ? 'OK' : 'failed'} ${ago(t.tested_at, now)}`.trim()
}

/**
 * The corner hint: missing credentials first, then the last test. A missing
 * credential is something to do (warn); only a failed test is a fault (bad).
 */
function hintOf(c: Category): { hint: string; tone: BlockTone | null } {
  const missing = missingCount(c.rows)
  if (missing) return { hint: `${missing} missing`, tone: 'warn' }
  if (c.test) return { hint: c.test.ok ? 'Test OK' : 'Test failed', tone: c.test.ok ? 'ok' : 'bad' }
  return { hint: '', tone: null }
}

/** A credential-only category (GitHub, Discord, MT5): is it set, and does it work. */
function credentialBlock(c: Category, now: number): BlockSummary {
  const secrets = c.rows.filter((r) => r.is_secret && !r.managed)
  const set = secrets.filter((r) => r.is_set).length
  const { hint, tone } = hintOf(c)
  const allSet = secrets.length > 0 && set === secrets.length
  return {
    figure: allSet ? 'Set' : set ? `${set}/${secrets.length}` : 'Unset',
    of:
      secrets.length === 1
        ? (secrets[0].masked ?? 'no value yet')
        : `${set} of ${secrets.length} set`,
    note: testLine(c.test, now) || (allSet ? 'Not tested yet' : 'Add it below to turn this on'),
    hint,
    tone: tone === 'bad' ? 'bad' : allSet ? (c.test?.ok ? 'ok' : 'idle') : 'warn',
    meter: null,
  }
}

function aiBlock(c: Category, usage: AiUsage | null, now: number): BlockSummary {
  const key = row(c, 'ANTHROPIC_API_KEY')
  const main = row(c, 'AI_MODEL_MAIN')
  const model = main ? modelNow(main) : null
  const modelText = model ? modelName(model) : 'model from .env'
  if (!key?.is_set) {
    return {
      figure: 'Off',
      of: 'no Anthropic API key',
      note: 'Add the key to turn on chat, agents and reports',
      hint: hintOf(c).hint,
      tone: 'warn',
      meter: null,
    }
  }
  if (!usage) {
    return {
      figure: modelText,
      of: 'main model',
      note: testLine(c.test, now) || 'Key set',
      hint: hintOf(c).hint,
      tone: c.test && !c.test.ok ? 'bad' : 'ok',
      meter: null,
    }
  }
  const level = levelOf(usage.spent_usd, usage.limit_usd)
  const cap = num(usage.limit_usd)
  return {
    figure: usd(usage.spent_usd),
    of: cap > 0 ? `of ${usd(usage.limit_usd)} this month` : 'this month, no cap',
    note: `${modelText} · ${usage.calls.toLocaleString()} call${usage.calls === 1 ? '' : 's'}`,
    hint: cap > 0 ? `${Math.min(100, Math.round((num(usage.spent_usd) / cap) * 100))}%` : '',
    tone: level === 'over' ? 'bad' : level === 'warn' ? 'warn' : 'ok',
    meter: cap > 0 ? Math.min(100, (num(usage.spent_usd) / cap) * 100) : null,
  }
}

function agentsBlock(c: Category): BlockSummary {
  const bools = c.rows.filter((r) => r.kind === 'bool')
  const on = bools.filter((r) => (r.masked ?? '').endsWith('true'))
  const image = row(c, 'AGENT_IMAGE_ENABLED')
  const imageOn = (image?.masked ?? '').endsWith('true')
  return {
    figure: image ? (imageOn ? 'On' : 'Off') : `${on.length}/${bools.length}`,
    of: image ? 'image generation' : 'switches on',
    note: `${bools.length} switch${bools.length === 1 ? '' : 'es'}`,
    hint: '',
    tone: 'idle',
    meter: null,
  }
}

function dhanBlock(c: Category, now: number): BlockSummary {
  const session = row(c, 'DHAN_SESSION_TOKEN')
  const manual = row(c, 'DHAN_ACCESS_TOKEN')
  const { hint, tone } = hintOf(c)
  const exp = session?.expires_at ? Date.parse(session.expires_at) : NaN
  if (session?.is_set && Number.isFinite(exp)) {
    const expired = exp <= now
    return {
      figure: expired ? 'Expired' : 'Active',
      of: expired ? 'session' : `session · ${session.expires_soon ? 'expires soon' : 'valid'}`,
      note: expired ? 'Log in to Dhan again below' : `Until ${new Date(exp).toLocaleString()}`,
      hint,
      tone: expired ? 'bad' : session.expires_soon ? 'warn' : 'ok',
      meter: null,
    }
  }
  if (manual?.is_set) {
    return {
      figure: 'Manual',
      of: 'access token',
      note: testLine(c.test, now) || 'No Dhan login session',
      hint,
      tone: tone === 'bad' ? 'bad' : 'idle',
      meter: null,
    }
  }
  return {
    figure: 'Off',
    of: 'not connected',
    note: 'Connect with your Dhan API key below',
    hint,
    tone: 'warn',
    meter: null,
  }
}

/** The overview block for one category. */
export function summarize(c: Category, usage: AiUsage | null, now = Date.now()): BlockSummary {
  switch (c.category) {
    case 'ai':
      return aiBlock(c, usage, now)
    case 'agents':
      return agentsBlock(c)
    case 'dhan':
      return dhanBlock(c, now)
    default:
      return credentialBlock(c, now)
  }
}
