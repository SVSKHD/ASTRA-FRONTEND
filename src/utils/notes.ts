// Notes are stored as HTML (the drawer's editor is a contentEditable), so the
// list has to derive plain text from that HTML to show a title and a preview.
// Doing it here rather than in the component keeps the regex work testable and
// stops two callers drifting on what "the first line" means.

// Block-level tags become line breaks before we strip the rest, otherwise
// "<div>a</div><div>b</div>" collapses into "ab" and the title swallows line two.
const BLOCK_BREAK = /<\/(p|div|h[1-6]|li|tr|blockquote)>|<br\s*\/?>/gi
const TAGS = /<[^>]*>/g

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

// HTML → plain text, one string per visual line, blanks dropped.
export function noteLines(html: string): string[] {
  const text = (html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(BLOCK_BREAK, '\n')
    .replace(TAGS, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
}

export function noteText(html: string): string {
  return noteLines(html).join(' ')
}

// The heading the list and the full view show. First line, capped so a note
// pasted as one long paragraph does not blow the row out.
export function noteTitle(html: string, max = 60): string {
  const first = noteLines(html)[0]
  if (!first) return 'Untitled note'
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first
}

// Everything after the title, flattened — the two-line preview under it.
export function notePreview(html: string, max = 140): string {
  const rest = noteLines(html).slice(1).join(' ')
  if (!rest) return ''
  return rest.length > max ? rest.slice(0, max - 1).trimEnd() + '…' : rest
}

// True when the editor holds nothing but markup — an empty <div>, a stray <br>.
// Saving one of those would leave an untouchable blank row in the list.
export function isBlankNote(html: string): boolean {
  return noteLines(html).length === 0
}

// How many checklist boxes the note has, and how many are ticked. The editor
// writes real <input type="checkbox">, so the state lives in the attribute.
export function noteChecks(html: string): { done: number; total: number } {
  const boxes = (html || '').match(/<input[^>]*type=["']?checkbox["']?[^>]*>/gi) || []
  const done = boxes.filter((b) => /\schecked\b/i.test(b)).length
  return { done, total: boxes.length }
}
