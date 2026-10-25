// The trade book rules, as blocks rather than as a markdown string.
//
// The rules are stored as markdown (settings.tradeBookRules) and that does not
// change — but nobody should have to write markdown to keep a checklist. The
// editor works on these blocks, one line each, and the markdown is only ever
// produced by `serializeRules` and read by `parseRules`.
//
// Parsing is lenient on purpose. "- [ ]Below 9 short" (no space after the
// bracket) is a rule to anyone reading it, and the strict markdown reading of
// it — a bullet whose text is "[ ]Below 9 short" — is the kind of thing that
// made the old editor feel like it had to be operated rather than written in.

export type RuleKind = 'heading' | 'subheading' | 'rule' | 'bullet' | 'text'

export interface RuleBlock {
  id: number
  kind: RuleKind
  text: string
}

let nextId = 1
export function makeBlock(kind: RuleKind = 'rule', text = ''): RuleBlock {
  return { id: nextId++, kind, text }
}

// `[x](url)` is a link, not a ticked box — hence the lookahead.
const RULE_RE = /^\s*(?:[-*+]|\d+[.)])?\s*\[(?: |x|X)?\](?!\()\s*(.*)$/
const BULLET_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/
const HEADING_RE = /^\s*(#{1,6})\s+(.*)$/

export function parseLine(line: string): Omit<RuleBlock, 'id'> {
  const heading = line.match(HEADING_RE)
  if (heading) {
    return { kind: heading[1].length === 1 ? 'heading' : 'subheading', text: heading[2].trim() }
  }
  const rule = line.match(RULE_RE)
  if (rule) return { kind: 'rule', text: rule[1].trim() }
  const bullet = line.match(BULLET_RE)
  if (bullet) return { kind: 'bullet', text: bullet[1].trim() }
  return { kind: 'text', text: line.trim() }
}

export function parseRules(source: string): RuleBlock[] {
  return (source ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const { kind, text } = parseLine(line)
      return makeBlock(kind, text)
    })
}

const PREFIX: Record<RuleKind, string> = {
  heading: '# ',
  subheading: '## ',
  rule: '- [ ] ',
  bullet: '- ',
  text: '',
}

/**
 * Back to markdown. Empty blocks are dropped (they are the editor's "new line
 * I have not typed into yet"), and headings get a blank line either side so the
 * stored text still reads cleanly anywhere markdown is rendered.
 *
 * Ticks are deliberately not stored: this is a checklist run before every
 * trade, and a box saved as ticked is a rule that is skipped next time.
 */
export function serializeRules(blocks: RuleBlock[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    const text = block.text.replace(/\s*\n\s*/g, ' ').trim()
    if (!text) continue
    const isHeading = block.kind === 'heading' || block.kind === 'subheading'
    if (isHeading && lines.length) lines.push('')
    lines.push(PREFIX[block.kind] + text)
    if (isHeading) lines.push('')
  }
  // Collapse the doubled blank line two adjacent headings leave between them.
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * A markdown marker typed at the start of a line, e.g. "# " or "[] ".
 * Returns the kind it asks for and how many characters to strip, or null.
 */
export function detectShortcut(text: string): { kind: RuleKind; strip: number } | null {
  const patterns: [RegExp, RuleKind][] = [
    [/^(?:[-*+]\s*)?\[(?: |x|X)?\]\s/, 'rule'],
    [/^#\s/, 'heading'],
    [/^#{2,6}\s/, 'subheading'],
    [/^(?:[-*+]|\d+[.)])\s/, 'bullet'],
  ]
  for (const [re, kind] of patterns) {
    const m = text.match(re)
    if (m) return { kind, strip: m[0].length }
  }
  return null
}

/** What a new line after this one should be: lists continue, headings start rules. */
export function nextKind(kind: RuleKind): RuleKind {
  if (kind === 'bullet' || kind === 'text') return kind
  return 'rule'
}
