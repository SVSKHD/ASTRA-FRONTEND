// The Prompts tab's AI helpers:
//
//   - generate: a use case in plain words → a few clean templates to pick from,
//     each with its own use case, topic and {{blanks}};
//   - improve: an existing template, rewritten clearer and tighter, keeping
//     its blanks;
//   - fill: the user's situation in plain words → a value for every blank;
//   - reply styles: one line appended to the finished prompt, asking the model
//     for a clean, neat answer (concise, steps, sections).
//
// Every answer is parsed and checked here before the tab trusts it, so a
// model that wanders off-format can only produce "nothing usable", never a
// broken template.

import { askAi, readJsonObject } from '@/utils/aiAsk'
import { chatTarget } from '@/utils/aiSettings'
import { blanksOf } from '@/utils/prompts'

/** A template the AI drafted, before the user saves it. */
export interface DraftTemplate {
  title: string
  topic: string
  useCase: string
  body: string
}

const TEMPLATE_RULES = `A template is a short, reusable prompt for an AI chat model. Rules:
- Say the task once, directly, in the imperative ("Summarise…", "Write…"). No greetings, no "please", no "I was wondering".
- Put everything that changes from one use to the next in blanks written {{name}} — short lowercase names such as {{text}}, {{audience}}, {{tone}}, {{length}}. 1 to 5 blanks. A long blank (pasted text, code, notes) goes last, on its own line.
- State the output wanted: its format, length and what to leave out, so the reply comes back clean and neat.
- Keep it under 90 words, plain text, no Markdown headings.`

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function readTemplate(raw: unknown): DraftTemplate | null {
  const t = (raw ?? {}) as Record<string, unknown>
  const body = str(t.body ?? t.prompt ?? t.template)
  if (!body || body.length > 4000) return null
  return {
    title: str(t.title).slice(0, 80) || 'Untitled prompt',
    topic: str(t.topic).slice(0, 40) || 'My prompts',
    useCase: str(t.useCase ?? t.use_case ?? t.description).slice(0, 240),
    body,
  }
}

/** The templates in a generate answer; at most `max`, each one usable. */
export function parseGenerated(answer: string, max = 4): DraftTemplate[] {
  const obj = readJsonObject(answer)
  const list = Array.isArray(obj?.templates) ? obj.templates : obj ? [obj] : []
  return list
    .map(readTemplate)
    .filter((t): t is DraftTemplate => !!t)
    .slice(0, max)
}

/**
 * Up to `count` new templates for what the user describes. Throws when the AI
 * cannot be reached; an empty list means it answered with nothing usable.
 */
export async function generateTemplates(
  useCase: string,
  count: number,
  topics: string[],
  signal?: AbortSignal,
): Promise<DraftTemplate[]> {
  const system = `You design prompt templates. ${TEMPLATE_RULES}
Write ${count} different template${count === 1 ? '' : 's'} for the use case the user describes — different angles on it, not rewordings of one. For each give a short title (2–5 words), a topic (prefer one of: ${topics.join(', ')}), and a one-sentence use case saying when to reach for it.
Reply with ONLY JSON: {"templates":[{"title":"…","topic":"…","useCase":"…","body":"…"}]}`
  const answer = await askAi(system, useCase.trim(), { target: chatTarget(), signal })
  if (answer == null) throw new Error('The AI could not be reached.')
  return parseGenerated(answer, count)
}

/** The improved body, only if it still has every blank the original had. */
export function parseImproved(answer: string, original: string): { body: string; useCase: string } | null {
  const t = readTemplate(readJsonObject(answer))
  if (!t) return null
  const had = blanksOf(original).map((b) => b.toLowerCase())
  const has = new Set(blanksOf(t.body).map((b) => b.toLowerCase()))
  if (had.some((b) => !has.has(b))) return null
  return { body: t.body, useCase: t.useCase }
}

export async function improveTemplate(
  body: string,
  useCase: string,
  signal?: AbortSignal,
): Promise<{ body: string; useCase: string } | null> {
  const system = `You improve prompt templates. ${TEMPLATE_RULES}
Rewrite the user's template to be clearer, tighter and more likely to get a clean answer. Keep every existing {{blank}} with exactly the same name; you may add one more only if the task clearly needs it. Also write a one-sentence use case.
Reply with ONLY JSON: {"body":"…","useCase":"…"}`
  const answer = await askAi(
    system,
    `Template:\n${body}${useCase ? `\n\nWhat it is for: ${useCase}` : ''}`,
    { target: chatTarget(), signal },
  )
  if (answer == null) throw new Error('The AI could not be reached.')
  return parseImproved(answer, body)
}

/** A value per blank from a fill answer — only blanks the template has, never empty. */
export function parseFill(answer: string, blanks: string[]): Record<string, string> {
  const obj = readJsonObject(answer) ?? {}
  const byLower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]))
  const out: Record<string, string> = {}
  for (const b of blanks) {
    const v = str(byLower.get(b.toLowerCase()))
    if (v) out[b] = v
  }
  return out
}

export async function fillBlanks(
  body: string,
  blanks: string[],
  situation: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const system = `You fill in the blanks of a prompt template from what the user tells you about their situation.
For each blank write the value that belongs there: specific, short and in the user's own terms; for a long blank (text, code, notes) use what they gave. Never invent facts they did not give — leave a blank out when you cannot fill it.
Reply with ONLY JSON mapping each blank name to its value, e.g. {"audience":"new hires","tone":"friendly"}.`
  const answer = await askAi(
    system,
    `Template:\n${body}\n\nBlanks: ${blanks.join(', ')}\n\nMy situation:\n${situation.trim()}`,
    { target: chatTarget(), signal },
  )
  if (answer == null) throw new Error('The AI could not be reached.')
  return parseFill(answer, blanks)
}

// ---- reply styles ------------------------------------------------------------

export type ReplyStyle = 'any' | 'concise' | 'steps' | 'sections'
export const REPLY_STYLES: { value: ReplyStyle; label: string; line: string }[] = [
  { value: 'any', label: 'Any', line: '' },
  {
    value: 'concise',
    label: 'Concise',
    line: 'Reply concisely: the answer first, then at most 5 short bullet points. No preamble, no filler, no closing summary.',
  },
  {
    value: 'steps',
    label: 'Steps',
    line: 'Reply as numbered steps, one clear action per step, one line each. No introduction.',
  },
  {
    value: 'sections',
    label: 'Sections',
    line: 'Reply in short sections, each with a bold heading and a few bullet points. Plain language, no filler.',
  },
]

/** The finished prompt with its reply-style line, if one is chosen. */
export function withReplyStyle(prompt: string, style: ReplyStyle): string {
  const line = REPLY_STYLES.find((s) => s.value === style)?.line
  return line && prompt.trim() ? `${prompt.trimEnd()}\n\n${line}` : prompt
}
