// Live deploy progress for the Deploys and CI monitor (Aureon docs/33-deploy-progress.md).
//
// Everything here reads the server's own answers: a stage is running, done or failed only
// because the deploy script reported it, and a deploy is "completed" only after Aureon
// recorded it as finished with a passed health check. Nothing is estimated: the progress
// bar is finished stages / planned stages, both from the server.
import type { Schemas } from '@/control/api'

export type MonitorItem = Schemas['MonitorItemOut']
export type Progress = Schemas['DeployProgressOut']
export type Stage = Schemas['DeployStageOut']
export type Outcome = Progress['outcome']
type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

/** `deploy:<run id>` -> the run id the progress endpoints take. */
export function runIdOf(item: Pick<MonitorItem, 'id' | 'kind'>): number | null {
  if (item.kind !== 'deploy') return null
  const m = /^deploy:(\d+)$/.exec(item.id)
  return m ? Number(m[1]) : null
}

export const isRunningDeploy = (i: MonitorItem) => i.kind === 'deploy' && i.status === 'running'

/**
 * Which deploy the progress stack shows: the admin's own pick while it is still listed;
 * otherwise the newest running deploy; otherwise the deploy that was being followed (so a
 * deploy that just finished stays on screen with its outcome); otherwise nothing.
 */
export function pickDeploy(
  items: MonitorItem[],
  chosen: string | null,
  followed: string | null = null,
): string | null {
  if (chosen && items.some((i) => i.id === chosen)) return chosen
  const running = items.find(isRunningDeploy)?.id
  if (running) return running
  return followed && items.some((i) => i.id === followed) ? followed : null
}

/** How often to poll: fast while anything deploys, slowly when idle. */
export const POLL_ACTIVE_MS = 4_000
export const POLL_IDLE_MS = 30_000
export function pollInterval(items: MonitorItem[], selected: Progress | null): number {
  const active = items.some(isRunningDeploy) || selected?.outcome === 'running'
  return active ? POLL_ACTIVE_MS : POLL_IDLE_MS
}

/** Finished stages / planned stages, from the server. null while nothing is known. */
export function percent(p: Pick<Progress, 'stages_completed' | 'stages_total'>): number | null {
  if (!p.stages_total) return null
  return Math.round((100 * Math.min(p.stages_completed, p.stages_total)) / p.stages_total)
}

export const STAGE_TONE: Record<Stage['status'], Tone> = {
  succeeded: 'success',
  running: 'info',
  failed: 'danger',
  skipped: 'neutral',
  pending: 'neutral',
}

export const STAGE_WORD: Record<Stage['status'], string> = {
  succeeded: 'Done',
  running: 'Running',
  failed: 'Failed',
  skipped: 'Skipped',
  pending: 'Pending',
}

export const OUTCOME: Record<Outcome, { tone: Tone; label: string }> = {
  running: { tone: 'info', label: 'Deploying' },
  completed: { tone: 'success', label: 'Deployed · health verified' },
  unverified: { tone: 'warning', label: 'Deployed · health NOT verified' },
  failed: { tone: 'danger', label: 'Failed' },
  rolled_back: { tone: 'danger', label: 'Failed · rolled back' },
  unknown: { tone: 'neutral', label: 'Unknown' },
}

/** One line under the title: the commit question the admin actually has. */
export function commitLine(p: Progress, short: (s?: string | null) => string): string {
  const deployed = p.deployed_sha ?? null
  const expected = p.expected_sha ?? null
  if (p.commit_verified === true) return `Running ${short(deployed)}, the expected commit.`
  if (p.commit_verified === false) {
    return deployed && expected && deployed !== expected
      ? `Deployed ${short(deployed)}, but ${short(expected)} was expected.`
      : 'The running release could not be matched to the expected commit.'
  }
  return expected ? `Deploying ${short(expected)}; not verified yet.` : 'Commit not known yet.'
}

export interface Notice {
  key: string
  tone: 'success' | 'danger' | 'warning'
  text: string
}

/**
 * A notice for each deploy that FINISHED since the previous poll (running -> anything else).
 * Deploys first seen already finished never notify, so opening the page is quiet.
 */
export function finishedSince(
  before: Map<string, string>,
  items: MonitorItem[],
  label: (i: MonitorItem) => string,
): Notice[] {
  const out: Notice[] = []
  for (const i of items) {
    if (i.kind !== 'deploy' || before.get(i.id) !== 'running' || i.status === 'running') continue
    const what = label(i)
    if (i.status === 'success') {
      out.push({
        key: i.id,
        tone: 'success',
        text: `${what} deployed and passed its health check.`,
      })
    } else if (i.rolled_back) {
      out.push({ key: i.id, tone: 'danger', text: `${what} failed and was rolled back.` })
    } else if (i.status === 'failure') {
      out.push({
        key: i.id,
        tone: 'danger',
        text: `${what} failed${i.error ? `: ${i.error}` : '.'}`,
      })
    } else {
      out.push({ key: i.id, tone: 'warning', text: `${what} finished: ${i.status}.` })
    }
  }
  return out
}

export function statusMap(items: MonitorItem[]): Map<string, string> {
  return new Map(items.filter((i) => i.kind === 'deploy').map((i) => [i.id, i.status]))
}
