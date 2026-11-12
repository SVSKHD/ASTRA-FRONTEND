// One question to the AI through the `/api/ai` proxy, answered as a single
// string — for the features that need an answer rather than a chat: typo
// fixing, the typo sweep, the Prompts tab's helpers. The chat itself streams
// into the thread instead (composables/useAiChat).

import { supabase } from '@/supabase'
import type { AiProvider } from '@/types'
import { aiBackend } from '@/ai/aureonChat'

export interface AiTarget {
  provider: AiProvider
  model: string
}

/**
 * Whether the one-off helpers (typo fix, the Prompts tab's Generate / Improve /
 * Fill) can run. Only on the proxy backend: on Aureon the only model is Claude,
 * and POST /api/ai/chat saves every call as a conversation and charges it to the
 * chat budget, so a typo fix would cost an Opus turn and fill the history. The
 * buttons are hidden there rather than offered and failing.
 */
export function aiHelpersAvailable(): boolean {
  return aiBackend() === 'proxy'
}

/**
 * The whole answer, or null when the question could not be asked: no proxy
 * configured, signed out, or the provider refused. Throws only on abort and on
 * a network failure, which the caller reports or ignores as it sees fit.
 */
export async function askAi(
  system: string,
  text: string,
  opts: { target: AiTarget; signal?: AbortSignal; background?: boolean },
): Promise<string | null> {
  // Claude-only Aureon: no helpers (see aiHelpersAvailable).
  if (!aiHelpersAvailable()) return null
  const url = import.meta.env.VITE_AI_PROXY_URL || ''
  if (!url) return null
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  if (!session) return null

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      ...opts.target,
      system,
      messages: [{ role: 'user', content: text }],
    }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) return null

  // The proxy streams `data: {"text": …}` lines; gather them into one answer.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const payload = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : ''
      if (!payload) continue
      try {
        const evt = JSON.parse(payload) as { text?: string; error?: string }
        if (evt.error) return null
        if (evt.text) answer += evt.text
      } catch {
        /* keep-alive */
      }
    }
  }
  return answer
}

/**
 * The first JSON object in a model's answer — fenced, bare, or with a line of
 * prose around it — or null when there is none.
 */
export function readJsonObject(answer: string): Record<string, unknown> | null {
  const body = answer
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const obj = JSON.parse(body.slice(start, end + 1)) as unknown
    return obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
