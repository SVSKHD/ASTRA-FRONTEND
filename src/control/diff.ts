// A unified diff, split into typed lines for the diff viewer, and capped.
//
// The cap is the phone's protection: a 2 MiB diff is tens of thousands of DOM
// rows, which locks a mid-range phone for seconds. The viewer renders at most
// `max` lines and says how many it left out (D-21-5).

export type DiffKind = 'file' | 'hunk' | 'add' | 'del' | 'ctx' | 'meta'
export interface DiffLine {
  n: number
  kind: DiffKind
  text: string
}
export interface ParsedDiff {
  lines: DiffLine[]
  total: number
  capped: boolean
}

export const DIFF_MAX_LINES = 2000

export function kindOf(line: string): DiffKind {
  if (line.startsWith('diff --git') || line.startsWith('+++ ') || line.startsWith('--- '))
    return 'file'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  if (
    line.startsWith('index ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity ') ||
    line.startsWith('rename ') ||
    line.startsWith('Binary files') ||
    line.startsWith('\\')
  )
    return 'meta'
  return 'ctx'
}

export function parseDiff(text: string, max = DIFF_MAX_LINES): ParsedDiff {
  if (!text) return { lines: [], total: 0, capped: false }
  const all = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  const kept = all.slice(0, max)
  return {
    lines: kept.map((t, i) => ({ n: i + 1, kind: kindOf(t), text: t })),
    total: all.length,
    capped: all.length > max,
  }
}

/** The last (or first) `max` lines of a text, and how many were left out. */
export function tail(
  text: string,
  max: number,
  from: 'tail' | 'head' = 'tail',
): { lines: string[]; dropped: number } {
  if (!text) return { lines: [], dropped: 0 }
  const all = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  if (all.length <= max) return { lines: all, dropped: 0 }
  return {
    lines: from === 'tail' ? all.slice(all.length - max) : all.slice(0, max),
    dropped: all.length - max,
  }
}
