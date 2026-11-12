// The GitHub AI workspace's pure parts: what each AI action sends, the TODO finder, and
// which server-side clone a GitHub repository's code tasks run in.
//
// The read-only actions (explain, architecture, bugs, commits, PR review) stream through
// POST /api/ai/chat to Claude's General agent, so the server's redaction and budgets
// apply and the steps show what happened. Everything
// they quote — files, the tree, commits, a diff — was read from GitHub through Aureon a
// moment before. A change is never made here: it is a code task on the server, tested on
// its own branch, and kept only when an admin approves its diff.

import { MAX_CONTENT } from '@/ai/aureonChat'

/** Room for the quoted material inside one message, leaving space for the instructions. */
export const QUOTE_BUDGET = MAX_CONTENT - 4000

export function clipText(text: string, budget = QUOTE_BUDGET): { text: string; clipped: boolean } {
  if (text.length <= budget) return { text, clipped: false }
  return {
    text: `${text.slice(0, budget)}\n…[cut: ${text.length - budget} more characters]`,
    clipped: true,
  }
}

export const SYSTEM =
  'You are a senior engineer helping with a GitHub repository. Answer from the material quoted ' +
  'in the message; when it is cut or missing, say what you could not see instead of guessing. ' +
  'Refer to files by path and to lines by number. Be concise and concrete.'

export type ActionKind = 'explain' | 'architecture' | 'bugs' | 'commits' | 'review'

export interface Ask {
  kind: ActionKind
  title: string
  prompt: string
  /** The quoted material was longer than one message and was cut. */
  clipped: boolean
}

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``

export function explainAsk(repo: string, ref: string, path: string, text: string): Ask {
  const q = clipText(text)
  return {
    kind: 'explain',
    title: `Explain ${path}`,
    clipped: q.clipped,
    prompt:
      `Explain what \`${path}\` in ${repo}@${ref} does: its purpose, the main pieces and how they ` +
      `fit together, and anything surprising.\n\n${fence('', q.text)}`,
  }
}

export function bugsAsk(repo: string, ref: string, path: string, text: string, todos: Todo[]): Ask {
  const q = clipText(text)
  const listed = todos.length
    ? `\n\nMarkers already found in the file:\n${todos.map((t) => `- line ${t.line}: ${t.tag} ${t.text}`).join('\n')}`
    : ''
  return {
    kind: 'bugs',
    title: `Bugs and TODOs in ${path}`,
    clipped: q.clipped,
    prompt:
      `Review \`${path}\` in ${repo}@${ref} for bugs: wrong logic, unhandled errors, edge cases, ` +
      `races, security problems. For each, give the line, what goes wrong and a fix. Then rank ` +
      `the TODO/FIXME markers by importance.${listed}\n\n${fence('', q.text)}`,
  }
}

export function architectureAsk(
  repo: string,
  ref: string,
  paths: string[],
  readme: string | null,
): Ask {
  const tree = clipText(paths.join('\n'), Math.floor(QUOTE_BUDGET * 0.6))
  const rd = readme ? clipText(readme, Math.floor(QUOTE_BUDGET * 0.4)) : null
  return {
    kind: 'architecture',
    title: `Architecture of ${repo}`,
    clipped: tree.clipped || !!rd?.clipped,
    prompt:
      `Describe the architecture of ${repo} at ${ref}: the layers and modules, how a request or ` +
      `job flows through them, where state lives, and the riskiest parts to change. Base it on ` +
      `the file list${rd ? ' and the README' : ''}.\n\nFiles (${paths.length}):\n${fence('', tree.text)}` +
      (rd ? `\n\nREADME:\n${fence('markdown', rd.text)}` : ''),
  }
}

export interface CommitLine {
  sha: string
  message: string
  author: string
  date: string
}

export function commitsAsk(repo: string, ref: string, commits: CommitLine[]): Ask {
  const body = commits
    .map((c) => `${c.sha.slice(0, 7)} ${c.date.slice(0, 10)} ${c.author}: ${c.message}`)
    .join('\n')
  const q = clipText(body)
  return {
    kind: 'commits',
    title: `Summary of ${commits.length} commits on ${ref}`,
    clipped: q.clipped,
    prompt:
      `Summarize these recent commits on ${repo}@${ref}: what changed, grouped by theme, and ` +
      `anything that looks risky or unfinished.\n\n${fence('', q.text)}`,
  }
}

export interface PullFile {
  filename: string
  status?: string | null
  additions?: number
  deletions?: number
  patch?: string | null
}

export function reviewAsk(
  repo: string,
  pr: { number: number; title: string; body?: string | null; head: string; base: string },
  files: PullFile[],
): Ask {
  const diff = files
    .map(
      (f) =>
        `--- ${f.filename} (${f.status ?? 'modified'}, +${f.additions ?? 0} -${f.deletions ?? 0})\n` +
        (f.patch ?? '(no patch: binary or too large)'),
    )
    .join('\n\n')
  const q = clipText(diff)
  return {
    kind: 'review',
    title: `Review of #${pr.number}`,
    clipped: q.clipped,
    prompt:
      `Review pull request #${pr.number} "${pr.title}" on ${repo} (${pr.head} → ${pr.base}). ` +
      `List problems by severity with file and line, then missing tests, then a verdict ` +
      `(approve / request changes). Description:\n${pr.body?.trim() || '(none)'}\n\n` +
      `${fence('diff', q.text)}`,
  }
}

// ---- TODOs -----------------------------------------------------------------------------

export interface Todo {
  line: number
  tag: string
  text: string
}

const TODO_RE = /(?:\/\/|#|\/\*|\*|<!--|--)\s*(TODO|FIXME|HACK|XXX|BUG)\b[:\s(]*(.*)$/

/** The TODO/FIXME/HACK/XXX/BUG markers in a file, with their line numbers. */
export function findTodos(text: string, limit = 100): Todo[] {
  const out: Todo[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const m = TODO_RE.exec(lines[i])
    if (m) out.push({ line: i + 1, tag: m[1], text: m[2].replace(/\*\/\s*$|-->\s*$/, '').trim() })
  }
  return out
}

// ---- where a change runs ----------------------------------------------------------------

export interface GitRepoState {
  repo: string
  coding_repo: string | null
  cloned: boolean
  default_branch: string | null
}

/** The server clone a GitHub repository's code tasks run in, or null when there is none. */
export function codingRepoFor(fullName: string, states: GitRepoState[]): string | null {
  const s = states.find((x) => x.repo.toLowerCase() === fullName.toLowerCase())
  return s?.coding_repo ?? null
}
