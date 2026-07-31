// The "make it useful, not a generic chatbot" layer: a compact, freshly-built
// context block assembled from the user's live app data and injected as a system
// prompt section. Pure and capped so it can be unit-tested and can never blow the
// token budget. The aiProxy Cloud Function prepends this to the system prompt.

import { formatINR } from '@/utils/currency'

export interface AiContextInput {
  overdueTodos: string[]
  todayTodos: string[]
  overdueTasks: string[]
  upcomingReminders: string[]
  income: number
  spent: number
  remaining: number
  trips: string[]
  noteTitles: string[]
  bots: { name: string; status: string; enabled: boolean }[]
}

function section(title: string, lines: string[]): string {
  if (!lines.length) return ''
  return `${title}:\n` + lines.map((l) => `- ${l}`).join('\n') + '\n'
}

// ~2k tokens ≈ 8000 chars. Built fresh each turn by the caller; this only shapes
// and caps it.
export function buildAiContext(input: AiContextInput, maxChars = 8000): string {
  const money = section('This month (INR)', [
    `income ${formatINR(input.income)}`,
    `spent ${formatINR(input.spent)}`,
    `remaining ${formatINR(input.remaining)}`,
  ])
  const parts = [
    section('Overdue todos', input.overdueTodos),
    section('Todos due today', input.todayTodos),
    section('Overdue tasks', input.overdueTasks),
    section('Upcoming reminders', input.upcomingReminders),
    money,
    section('Active trips', input.trips),
    section('Recent notes', input.noteTitles),
    section(
      'Bots',
      input.bots.map((b) => `${b.name} — ${b.status}${b.enabled ? ' (enabled)' : ''}`),
    ),
  ].filter(Boolean)

  const block = ["[AUREON CONTEXT — the user's live data]", ...parts].join('\n').trim()
  if (block.length <= maxChars) return block
  return block.slice(0, maxChars - 1).trimEnd() + '…'
}

// Empty-state suggestion chips. Static labels; the useful data goes into the
// context block above once the user picks one.
export const SUGGESTION_CHIPS: string[] = [
  'Summarise my overdue todos',
  "Where did this month's money go?",
  "What's my next reminder?",
  "Draft a note from this week's tasks",
]

// A short title from the first user message (no extra model call): first line,
// trimmed to a handful of words.
export function titleFromMessage(text: string): string {
  const firstLine = (text || '').split('\n')[0].trim()
  if (!firstLine) return 'New chat'
  const words = firstLine.split(/\s+/).slice(0, 6).join(' ')
  return words.length > 48 ? words.slice(0, 48) + '…' : words
}
