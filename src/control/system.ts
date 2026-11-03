// The server dashboard's reads (GET /api/health, /api/health/ready,
// /api/system/status). The OpenAPI schema types these three as free-form
// objects, so the shapes below are written from the backend itself
// (app/api/v1/health.py, app/services/health.py, app/services/system.py) and
// every field is optional: a section that failed carries only `ok`, `error`
// and `latency_ms`. Nothing here invents a number the server did not send.

import type { Tone } from '@/control/status'

export type Health = 'healthy' | 'degraded' | 'unavailable' | 'unknown'

/** Every system/status section: `ok`, plus `error` when the probe itself failed. */
export interface Section {
  ok?: boolean
  error?: string
  latency_ms?: number
}

export interface Disk {
  path?: string
  ok?: boolean
  error?: string
  total_bytes?: number
  used_bytes?: number
  free_bytes?: number
  percent?: number
}

export interface HostSection extends Section {
  cpu?: { count?: number; percent?: number; load_avg?: number[] }
  memory?: {
    total_bytes?: number
    available_bytes?: number
    percent?: number
    swap_percent?: number
  }
  disks?: Record<string, Disk>
  uptime_seconds?: number
}

export interface Container {
  name?: string
  image?: string
  state?: string
  status?: string
}

export interface SystemStatus {
  status?: string
  generated_at?: string
  host?: HostSection
  postgres?: Section & { version?: string; database_bytes?: number; connections?: number }
  redis?: Section & { used_memory_bytes?: number }
  ollama?: Section & { installed_models?: number; loaded_models?: string[] }
  imaging?: Section & { worker?: string; queued?: number; running?: number }
  docker?: Section & { containers?: Container[]; not_running_or_unhealthy?: string[] }
  host_services?: Section & {
    stale?: boolean
    age_seconds?: number
    units?: Record<string, string>
  }
}

export interface ReadyCheck {
  ok?: boolean
  latency_ms?: number
  detail?: string
}

export interface Readiness {
  status?: string
  checks?: Record<string, ReadyCheck>
}

/**
 * A section's state. Absent: unknown. `ok`: healthy. Not ok with `error`: the
 * probe could not reach it (unavailable). Not ok without one: it answered, but
 * something in it is wrong — a full disk, a stopped container (degraded).
 */
export function sectionHealth(s: Section | undefined | null): Health {
  if (!s || typeof s.ok !== 'boolean') return 'unknown'
  if (s.ok) return 'healthy'
  return s.error ? 'unavailable' : 'degraded'
}

export function healthTone(h: Health): Tone {
  return h === 'healthy'
    ? 'success'
    : h === 'degraded'
      ? 'warning'
      : h === 'unavailable'
        ? 'danger'
        : 'neutral'
}

/** The whole server: worst of liveness, readiness and the status sections. */
export function overallHealth(
  live: boolean | null,
  ready: Readiness | null,
  status: SystemStatus | null,
): Health {
  if (live === false) return 'unavailable'
  if (live === null && !ready && !status) return 'unknown'
  const checks = Object.values(ready?.checks ?? {})
  if (checks.some((c) => c.ok === false)) return 'degraded'
  if (status?.status && status.status !== 'ok') return 'degraded'
  return live ? 'healthy' : 'unknown'
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** "512 MB", "1.8 GB"; "—" when the server did not send it. */
export function bytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—'
  let v = n
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${UNITS[i]}`
}

/** "42%"; "—" when absent. */
export function pct(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : `${Math.round(n)}%`
}

/** "3 d 4 h", "5 h 12 min", "8 min"; "—" when absent. */
export function uptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d) return `${d} d ${h % 24} h`
  if (h) return `${h} h ${m % 60} min`
  return `${m} min`
}

export const READY_LABEL: Record<string, string> = {
  postgres: 'PostgreSQL',
  redis: 'Redis',
  ollama: 'Ollama',
  data_root: 'Data disk (HDD)',
}
