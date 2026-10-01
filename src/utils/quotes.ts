// The quotes collection behind the Daily spark card: reading a paste of quotes,
// forgivingly, and keeping stored ones clean.
//
// A paste may be any of:
//   • a JSON array of strings: ["Done is better than perfect.", ...]
//   • a JSON array of objects: [{ "text": "...", "by": "Seneca" }, ...]
//     (`quote` for text and `author` for by are read too)
//   • a JSON object holding one of those under `quotes` or `items`
//   • plain text, one quote per line, an author after " — " or " - "
// Code fences, smart quotes, trailing commas and blank lines are tidied first.

export interface QuoteInput {
  text: string
  by: string
}

const MAX_TEXT = 280
const MAX_BY = 80

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}
// Stray wrapping quotation marks around a whole line are not part of it.
function unwrap(text: string): string {
  return text.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim()
}

function fromValue(v: unknown): QuoteInput | null {
  if (typeof v === 'string') {
    const text = unwrap(clean(v, MAX_TEXT))
    return text ? { text, by: '' } : null
  }
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const text = unwrap(clean(r.text ?? r.quote ?? r.q ?? r.line, MAX_TEXT))
  if (!text) return null
  return { text, by: clean(r.by ?? r.author ?? r.a ?? r.who, MAX_BY) }
}

function fromLine(line: string): QuoteInput | null {
  const raw = line.replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim()
  if (!raw) return null
  // "Text — Author" (or " - Author"), only when the author part is short.
  const m = raw.match(/^(.*?)\s+[—–-]\s+([^—–-]{2,60})$/)
  const text = unwrap(clean(m ? m[1] : raw, MAX_TEXT))
  return text ? { text, by: m ? clean(m[2], MAX_BY) : '' } : null
}

export function parseQuotes(input: string): { quotes: QuoteInput[]; as: 'json' | 'lines' } {
  const tidied = input
    .replace(/^﻿/, '')
    .replace(/^\s*```[a-zA-Z]*\s*/, '')
    .replace(/\s*```\s*$/, '')
    .replace(/,(\s*[}\]])/g, '$1')
    .trim()
  if (!tidied) return { quotes: [], as: 'lines' }
  if (tidied.startsWith('[') || tidied.startsWith('{')) {
    try {
      // Curly quotes inside JSON break it; straighten them only for JSON.
      const parsed = JSON.parse(tidied.replace(/[“”]/g, '"')) as unknown
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object'
          ? ((parsed as Record<string, unknown>).quotes ??
            (parsed as Record<string, unknown>).items ?? [parsed])
          : []
      const quotes = (Array.isArray(list) ? list : [])
        .map(fromValue)
        .filter((q): q is QuoteInput => q !== null)
      return { quotes, as: 'json' }
    } catch {
      /* not JSON after all — read it as lines */
    }
  }
  return {
    quotes: tidied
      .split(/\r?\n/)
      .map(fromLine)
      .filter((q): q is QuoteInput => q !== null),
    as: 'lines',
  }
}

/** The same words, ignoring case, spacing and punctuation at the ends. */
export function quoteKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
