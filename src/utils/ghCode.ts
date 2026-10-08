// The pure half of the GitHub tab's Code and Pull requests panes: turning
// GitHub's flat tree into folders, naming a file's language, moving file text
// in and out of base64 without breaking non-ASCII, and reading a PR patch line
// by line. Nothing here touches the network, so all of it is tested directly.

/** One entry of `GET /git/trees/{ref}?recursive=1`. */
export interface GhTreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

/** A folder or a file in the browsable tree. */
export interface CodeNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  size: number
  children: CodeNode[]
}

/**
 * GitHub's flat list as a tree: folders first, then files, each by name.
 * Submodules (`commit` entries) are left out — there is nothing to open.
 */
export function buildCodeTree(entries: GhTreeEntry[]): CodeNode[] {
  const root: CodeNode = { name: '', path: '', kind: 'dir', size: 0, children: [] }
  const dirs = new Map<string, CodeNode>([['', root]])

  function dirFor(path: string): CodeNode {
    const hit = dirs.get(path)
    if (hit) return hit
    const cut = path.lastIndexOf('/')
    const parent = dirFor(cut < 0 ? '' : path.slice(0, cut))
    const node: CodeNode = {
      name: cut < 0 ? path : path.slice(cut + 1),
      path,
      kind: 'dir',
      size: 0,
      children: [],
    }
    parent.children.push(node)
    dirs.set(path, node)
    return node
  }

  for (const e of entries) {
    if (e.type === 'tree') dirFor(e.path)
    else if (e.type === 'blob') {
      const cut = e.path.lastIndexOf('/')
      dirFor(cut < 0 ? '' : e.path.slice(0, cut)).children.push({
        name: cut < 0 ? e.path : e.path.slice(cut + 1),
        path: e.path,
        kind: 'file',
        size: e.size ?? 0,
        children: [],
      })
    }
  }

  const sort = (n: CodeNode) => {
    n.children.sort((a, b) =>
      a.kind !== b.kind
        ? a.kind === 'dir'
          ? -1
          : 1
        : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
    n.children.forEach(sort)
  }
  sort(root)
  return root.children
}

/** Files whose path contains the query, case-insensitively, at most `limit`. */
export function searchPaths(entries: GhTreeEntry[], query: string, limit = 60): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: string[] = []
  for (const e of entries) {
    if (e.type !== 'blob') continue
    if (e.path.toLowerCase().includes(q)) out.push(e.path)
    if (out.length >= limit) break
  }
  return out
}

/** The folders on the way to a path: `a/b/c.ts` → `['a', 'a/b']`. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  vue: 'xml',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sql: 'sql',
  dockerfile: 'dockerfile',
}

/** The highlight.js language for a file, or '' when there is no good guess. */
export function languageOf(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : (LANG_BY_EXT[name.slice(dot + 1)] ?? '')
}

/** A short label for the language chip: the extension, upper-cased. */
export function extLabel(path: string): string {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? 'FILE' : name.slice(dot + 1).toUpperCase()
}

/**
 * Base64 → text, as UTF-8. `atob` alone yields one char per byte, which turns
 * every non-ASCII character into mojibake. GitHub also wraps its base64 at 60
 * columns, so whitespace is dropped first.
 */
export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''))
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** Text → base64, as UTF-8; the inverse of `decodeBase64Utf8`. */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  // In slices: spreading a large array into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** Whether decoded text is really binary (a NUL in the first 8 KB says so). */
export function looksBinary(text: string): boolean {
  return text.slice(0, 8000).includes('\u0000')
}

/** Files above this are shown read-only: the contents API stops at 1 MB. */
export const MAX_EDIT_BYTES = 1_000_000

/** One line of a unified diff, with the line numbers on each side. */
export interface DiffLine {
  kind: 'hunk' | 'add' | 'del' | 'ctx'
  text: string
  oldNo: number | null
  newNo: number | null
}

/** A PR file's `patch` as numbered lines, for a side-by-side gutter. */
export function parsePatch(patch: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const line of patch.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      out.push({ kind: 'hunk', text: line, oldNo: null, newNo: null })
    } else if (line.startsWith('+')) {
      out.push({ kind: 'add', text: line.slice(1), oldNo: null, newNo: newNo++ })
    } else if (line.startsWith('-')) {
      out.push({ kind: 'del', text: line.slice(1), oldNo: oldNo++, newNo: null })
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — a note about the diff, not a line of it.
      continue
    } else {
      out.push({ kind: 'ctx', text: line.slice(1), oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return out
}

/** A byte count as people read it: 812 B, 4.2 KB, 1.3 MB. */
export function formatBytes(n: number): string {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

/** A pull request's state as the list shows it. */
export type PullStatus = 'open' | 'draft' | 'merged' | 'closed'
export function pullStatus(p: {
  state?: string
  draft?: boolean
  merged_at?: string | null
}): PullStatus {
  if (p.state === 'open') return p.draft ? 'draft' : 'open'
  return p.merged_at ? 'merged' : 'closed'
}
