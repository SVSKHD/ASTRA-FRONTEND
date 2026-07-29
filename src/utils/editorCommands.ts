// The slash-command vocabulary, shared by the note editor's floating menu
// (RichEditor.vue) and the drawer's Commands help panel (NotesDrawer.vue), so
// the two can never list a different set. The editor maps each id to an action;
// the help panel only reads the descriptions and previews.

export type BlockKind =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'paragraph'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'divider'
  | 'code'

export interface SlashCommand {
  id: BlockKind
  label: string
  hint: string // one-line description
  example: string // what to type, e.g. '/heading1'
  keywords: string[] // extra filter terms
  // A tiny HTML preview of the result, rendered with the shared `.rich` styles.
  preview: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'heading1',
    label: 'Heading 1',
    hint: 'Large section heading',
    example: '/heading1',
    keywords: ['h1', 'title', 'heading'],
    preview: '<h1>Heading 1</h1>',
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    hint: 'Medium section heading',
    example: '/heading2',
    keywords: ['h2', 'subtitle', 'heading'],
    preview: '<h2>Heading 2</h2>',
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    hint: 'Small section heading',
    example: '/heading3',
    keywords: ['h3', 'heading'],
    preview: '<h3>Heading 3</h3>',
  },
  {
    id: 'paragraph',
    label: 'Paragraph',
    hint: 'Plain body text',
    example: '/paragraph',
    keywords: ['text', 'body', 'p', 'plain'],
    preview: '<p>Plain text</p>',
  },
  {
    id: 'bullet',
    label: 'Bulleted list',
    hint: 'A simple bullet list',
    example: '/bullet',
    keywords: ['ul', 'unordered', 'list', 'dash'],
    preview: '<ul><li>List item</li></ul>',
  },
  {
    id: 'numbered',
    label: 'Numbered list',
    hint: 'An ordered list',
    example: '/numbered',
    keywords: ['ol', 'ordered', 'list', 'number'],
    preview: '<ol><li>List item</li></ol>',
  },
  {
    id: 'todo',
    label: 'To-do',
    hint: 'A checkbox you can tick',
    example: '/todo',
    keywords: ['check', 'checkbox', 'task', 'tick'],
    preview:
      '<div style="display:flex;align-items:center;gap:8px"><input type="checkbox" checked disabled><span>Task done</span></div>',
  },
  {
    id: 'quote',
    label: 'Quote',
    hint: 'A blockquote callout',
    example: '/quote',
    keywords: ['blockquote', 'cite'],
    preview: '<blockquote>A quoted line</blockquote>',
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'A horizontal rule',
    example: '/divider',
    keywords: ['hr', 'rule', 'line', 'separator'],
    preview: '<hr>',
  },
  {
    id: 'code',
    label: 'Code block',
    hint: 'Monospace code block',
    example: '/code',
    keywords: ['pre', 'snippet', 'monospace'],
    preview: '<pre>code()</pre>',
  },
]

export interface MarkdownShortcut {
  syntax: string
  hint: string
}

// The inline / line-start markdown that converts as you type — surfaced in the
// help panel so the shortcuts are discoverable, not folklore.
export const MARKDOWN_SHORTCUTS: MarkdownShortcut[] = [
  { syntax: '# ', hint: 'Heading 1' },
  { syntax: '## ', hint: 'Heading 2' },
  { syntax: '### ', hint: 'Heading 3' },
  { syntax: '- ', hint: 'Bulleted list' },
  { syntax: '1. ', hint: 'Numbered list' },
  { syntax: '> ', hint: 'Quote' },
  { syntax: '[ ] ', hint: 'To-do checkbox' },
  { syntax: '**bold**', hint: 'Bold text' },
  { syntax: '*italic*', hint: 'Italic text' },
  { syntax: '`code`', hint: 'Inline code' },
]

// A permissive filter: match on label, id, or any keyword. An empty query
// returns everything so the menu opens on a bare "/".
export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.id.includes(q) ||
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.includes(q)),
  )
}
