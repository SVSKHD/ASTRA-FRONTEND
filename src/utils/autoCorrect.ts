// Typo correction through the same `/api/ai` proxy the AI tab uses: the text
// goes to the provider picked in the AI tab (the cheapest model on OpenRouter,
// see utils/aiSettings) with an instruction to
// fix spelling and clear grammar slips and nothing else, and the reply is
// checked before anyone trusts it — a model
// asked to fix "teh" must not hand back a rewritten paragraph.

import { askAi } from '@/utils/aiAsk'
import { proofreadTarget } from '@/utils/aiSettings'

const MAX_CHARS = 2000

/** What counts as a mistake, and what must be left alone. Shared with the AI tab's bulk sweep. */
export const PROOFREAD_RULES = `Correct:
- spelling mistakes and typos (swapped, missing or doubled letters, words run together or split apart);
- clear grammar mistakes: wrong word (their/there, your/you're, its/it's), subject–verb agreement, wrong verb or plural form, a missing small word such as "a", "the" or "to";
- capitalise "I" and the first letter of each sentence.
Make the smallest change that fixes each mistake. Keep the meaning, wording, word order, tone, line breaks, emoji, names, abbreviations, slang, code, URLs, numbers and language. Never rephrase, translate, shorten, complete or add sentences. Short notes and to-do items without a full sentence structure are fine as they are — only fix their spelling.`

const INSTRUCTIONS = `You are a proofreader. ${PROOFREAD_RULES}
Return ONLY the corrected text — no quotes, no explanation, no Markdown.
If nothing needs fixing, return the text unchanged.`

/** Whether a value is worth sending at all: real words, not a URL, code or data. */
export function isCorrectable(text: string): boolean {
  const t = text.trim()
  if (t.length < 4 || t.length > MAX_CHARS) return false
  if (!/[a-z]{3,}/i.test(t)) return false
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return false
  if (/^[[{]/.test(t)) return false // JSON
  if (/```|=>|[{};]\s*$/m.test(t)) return false // code
  return true
}

/**
 * The model's answer is only taken when it is plausibly the same text with
 * typos fixed: same line count and roughly the same length.
 */
export function plausibleCorrection(before: string, after: string): boolean {
  if (!after.trim()) return false
  if (before.split('\n').length !== after.split('\n').length) return false
  const ratio = after.length / Math.max(1, before.length)
  return ratio > 0.75 && ratio < 1.35
}

function tidy(reply: string, original: string): string {
  let out = reply.replace(/^```\w*\n?|\n?```$/g, '')
  // A reply wrapped in quotes the original did not have.
  if (/^["'“].*["'”]$/s.test(out.trim()) && !/^["'“]/.test(original.trim())) {
    out = out.trim().slice(1, -1)
  }
  // Keep the original's leading/trailing whitespace — the caret may sit there.
  const lead = /^\s*/.exec(original)?.[0] ?? ''
  const trail = /\s*$/.exec(original)?.[0] ?? ''
  return lead + out.trim() + trail
}

/**
 * One question to the cheap proofreading model, answered as a single string.
 * Null when it could not run (no proxy, signed out, an upstream error).
 */
export function askProofreader(
  system: string,
  text: string,
  signal?: AbortSignal,
  asked = false,
): Promise<string | null> {
  // `asked`: the user started it (the typo sweep), as opposed to proofreading
  // on every pause in typing. Only asked-for work runs on the local Aureon model.
  return askAi(system, text, { target: proofreadTarget(), signal, background: !asked })
}

/**
 * The text with its typos fixed, or null when there is nothing to change or
 * the check could not run (offline, signed out, no proxy, an odd answer).
 */
export async function correctTypos(text: string, signal?: AbortSignal): Promise<string | null> {
  if (!isCorrectable(text)) return null
  const answer = await askProofreader(INSTRUCTIONS, text, signal)
  if (answer == null) return null
  const fixed = tidy(answer, text)
  if (fixed === text || !plausibleCorrection(text, fixed)) return null
  return fixed
}
