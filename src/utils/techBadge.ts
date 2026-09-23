// What a repository is built with, as a badge.
//
// SYMBOLS, NOT LOGOS. The obvious way to show "TypeScript" is the TypeScript
// logo, and every version of that means shipping a third-party icon set — a
// megabyte of brand SVGs, or a CDN request per row, for a decoration. It also
// dates: a logo redraw makes the app wrong, and a language without a logo has
// no fallback at all.
//
// So each technology gets a monogram in its own colour — the same colours
// GitHub uses on a repository card, which is where the reader has seen them
// before. Two characters, because at chip size that is what stays legible, and
// an unknown language still gets a sensible one rather than a blank.

export interface TechBadge {
  /** The language's full name, for the title and for screen readers. */
  name: string
  /** One or two characters: TS, PY, C#, GO. */
  symbol: string
  /** GitHub's colour for the language, or a neutral for one we don't know. */
  color: string
}

/**
 * GitHub's own language colours, for what actually turns up in a repository
 * list. Anything missing falls back to a neutral rather than to a random hue —
 * a colour nobody chose is worse than no colour.
 */
const COLOR: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f1e05a',
  python: '#3572a5',
  'c#': '#178600',
  'c++': '#f34b7d',
  c: '#555555',
  css: '#663399',
  html: '#e34c26',
  vue: '#41b883',
  svelte: '#ff3e00',
  java: '#b07219',
  kotlin: '#a97bff',
  swift: '#f05138',
  go: '#00add8',
  rust: '#dea584',
  ruby: '#701516',
  php: '#4f5d95',
  dart: '#00b4ab',
  shell: '#89e051',
  powershell: '#012456',
  dockerfile: '#384d54',
  makefile: '#427819',
  scss: '#c6538c',
  less: '#1d365d',
  lua: '#000080',
  r: '#198ce7',
  scala: '#c22d40',
  elixir: '#6e4a7e',
  haskell: '#5e5086',
  perl: '#0298c3',
  solidity: '#aa6746',
  jupyter: '#da5b0b',
  'jupyter notebook': '#da5b0b',
  mdx: '#fcb32c',
  markdown: '#083fa1',
  nix: '#7e7eff',
  zig: '#ec915c',
}

const NEUTRAL = '#8b949e'

/** Names whose obvious first letters would collide or mislead. */
const SYMBOL: Record<string, string> = {
  typescript: 'TS',
  javascript: 'JS',
  python: 'PY',
  'c#': 'C#',
  'c++': '++',
  c: 'C',
  'objective-c': 'OC',
  csharp: 'C#',
  html: '<>',
  css: '{}',
  scss: '{}',
  less: '{}',
  shell: '>_',
  powershell: '>_',
  batchfile: '>_',
  dockerfile: '🐳',
  'jupyter notebook': 'JN',
  go: 'GO',
  rust: 'RS',
  ruby: 'RB',
  php: 'PHP',
  java: 'JV',
  kotlin: 'KT',
  swift: 'SW',
  dart: 'DT',
  vue: 'V',
  svelte: 'SV',
  solidity: 'SOL',
  markdown: 'MD',
  mdx: 'MDX',
}

/**
 * The badge for one language name.
 *
 * The fallback monogram is the first two letters rather than an initial: `Nix`
 * and `Nim` are both "N", and two characters tell them apart without a table
 * entry for every language GitHub knows.
 */
export function techBadge(name: string): TechBadge {
  const clean = name.trim()
  const key = clean.toLowerCase()
  return {
    name: clean,
    symbol: SYMBOL[key] ?? clean.slice(0, 2).toUpperCase(),
    color: COLOR[key] ?? NEUTRAL,
  }
}

/**
 * The technologies in a repository, biggest first.
 *
 * `raw` is GitHub's `/languages` body — a map of language to bytes of code.
 * Capped, because a chip row is a summary: past three the row wraps and stops
 * being readable at a glance, and the tail is always a stray config file.
 */
export function topTech(raw: unknown, limit = 3): TechBadge[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const rows = Object.entries(raw as Record<string, unknown>)
    .map(([name, bytes]) => ({ name, bytes: typeof bytes === 'number' ? bytes : 0 }))
    .filter((r) => r.name.trim() && r.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, Math.max(0, limit))
  return rows.map((r) => techBadge(r.name))
}
