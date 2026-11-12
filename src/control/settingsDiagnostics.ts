// Settings diagnostics (backend GET /api/v1/settings/diagnostics): the pure half of
// the Diagnose panel. It answers "why is this key not doing what I set?" by showing
// every layer a value passes through, as masks only:
//
//   .env (or the default) → the encrypted DB row → what a reload would give → what the
//   server is running with now
//
// and naming where they disagree. Nothing here ever holds a value.
import type { Schemas } from '@/control/api'

export type Diagnostics = Schemas['DiagnosticsOut']
export type KeyDiagnosis = Schemas['KeyDiagnosisOut']
export type IssueCode = KeyDiagnosis['issues'][number]
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface IssueInfo {
  label: string
  tone: Tone
  /** What it means and what to do, in one or two sentences. */
  fix: string
}

export const ISSUES: Record<IssueCode, IssueInfo> = {
  db_undecryptable: {
    label: 'Unreadable in DB',
    tone: 'danger',
    fix: 'The saved value was encrypted with a different SETTINGS_MASTER_KEY, so the server ignores it. Save the value again here, or revert it to .env.',
  },
  db_rejected: {
    label: 'Invalid in DB',
    tone: 'danger',
    fix: 'The saved value fails validation. Save a valid value or revert it to .env.',
  },
  db_ignored: {
    label: 'DB ignored',
    tone: 'warning',
    fix: 'Another saved setting is invalid, so the server ignores every saved value and runs on .env alone. Fix the invalid one first.',
  },
  stale: {
    label: 'Not applied',
    tone: 'warning',
    fix: 'The server is still running an older value. Press “Reload settings”.',
  },
  shadows_env: {
    label: 'Overrides .env',
    tone: 'info',
    fix: 'The value saved here replaces a different one in .env. Expected after a change here; revert to go back to .env.',
  },
}

/** Issues that stop a value from working (shadows_env is information only). */
export function isProblem(code: IssueCode): boolean {
  return code !== 'shadows_env'
}

export function problemKeys(d: Diagnostics): KeyDiagnosis[] {
  return d.keys.filter((k) => k.issues.some(isProblem))
}

export interface Check {
  id: string
  label: string
  value: string
  tone: Tone
  detail?: string
}

/** The summary row: one card per layer, each ok / warning / broken. */
export function checks(d: Diagnostics): Check[] {
  const out: Check[] = []
  out.push({
    id: 'server',
    label: 'Server',
    value: d.server.host,
    tone: 'neutral',
    detail: `${d.server.environment} · pid ${d.server.pid}`,
  })
  out.push(
    d.encryption_ready
      ? {
          id: 'encryption',
          label: 'Encryption',
          value: 'Ready',
          tone: 'success',
          detail: `${d.master_keys} master key${d.master_keys === 1 ? '' : 's'}`,
        }
      : {
          id: 'encryption',
          label: 'Encryption',
          value: 'Off',
          tone: 'danger',
          detail: d.encryption_problem ?? 'SETTINGS_MASTER_KEY is not set',
        },
  )
  out.push(
    d.database_ok
      ? {
          id: 'database',
          label: 'Database',
          value: `${d.rows} saved`,
          tone: d.undecryptable.length || d.rejected.length ? 'danger' : 'success',
          detail: d.undecryptable.length
            ? `${d.undecryptable.length} unreadable`
            : d.rejected.length
              ? `${d.rejected.length} invalid`
              : d.unknown_rows.length
                ? `${d.unknown_rows.length} old key${d.unknown_rows.length === 1 ? '' : 's'} ignored`
                : 'All readable',
        }
      : {
          id: 'database',
          label: 'Database',
          value: 'Unreachable',
          tone: 'danger',
          detail: d.database_error ?? undefined,
        },
  )
  out.push(
    d.overlay_ok
      ? { id: 'overlay', label: 'Saved values', value: 'Applied', tone: 'success' }
      : {
          id: 'overlay',
          label: 'Saved values',
          value: 'All ignored',
          tone: 'danger',
          detail: `invalid: ${d.overlay_fields.join(', ') || 'unknown'}`,
        },
  )
  out.push(
    d.stale.length
      ? {
          id: 'live',
          label: 'Running',
          value: `${d.stale.length} not applied`,
          tone: 'warning',
          detail: 'Reload settings',
        }
      : { id: 'live', label: 'Running', value: 'Up to date', tone: 'success' },
  )
  const ai = d.ai
  out.push(
    !ai.configured
      ? {
          id: 'claude',
          label: 'Claude',
          value: 'No key',
          tone: 'danger',
          detail: 'ANTHROPIC_API_KEY is not in effect',
        }
      : !ai.matches_settings
        ? {
            id: 'claude',
            label: 'Claude',
            value: `Old key ${ai.key_masked ?? ''}`.trim(),
            tone: 'warning',
            detail: 'Reload settings',
          }
        : {
            id: 'claude',
            label: 'Claude',
            value: `Key ${ai.key_masked ?? ''}`.trim(),
            tone: 'success',
            detail: ai.model_main,
          },
  )
  return out
}

/** One headline for the whole report. */
export function headline(d: Diagnostics): { tone: Tone; text: string } {
  const broken = checks(d).filter((c) => c.tone === 'danger').length
  const warn = checks(d).filter((c) => c.tone === 'warning').length
  if (broken) return { tone: 'danger', text: `${broken} problem${broken === 1 ? '' : 's'} found` }
  if (warn) return { tone: 'warning', text: 'Saved changes are waiting to be applied' }
  return { tone: 'success', text: 'Every layer agrees' }
}

export const SOURCE_LABEL: Record<string, string> = {
  db: 'Saved here',
  env: '.env',
  default: 'Default',
  unset: 'Not set',
}

export type Filter = 'problems' | 'category' | 'all'

export function filterKeys(d: Diagnostics, filter: Filter, category?: string): KeyDiagnosis[] {
  if (filter === 'problems') return problemKeys(d)
  if (filter === 'category') return d.keys.filter((k) => k.category === category)
  return d.keys
}

/** The value at one layer, for a cell: the mask, or a dash. */
export function cell(masked: string | null | undefined): string {
  return masked ?? '—'
}
