// The AI tab on Aureon_Agentic (migration stage 4): local Ollama behind
// POST /api/chat, instead of the Netlify /api/ai proxy (Bytez / OpenRouter).
//
//   VITE_AI_BACKEND=aureon   (default) Aureon: offline, a model picked from GET /api/models
//   VITE_AI_BACKEND=proxy    the Netlify function, as before (a Netlify-hosted build)
//
// Two differences from the proxy shape the code here absorbs:
//
// • Aureon keeps the conversation. A request carries only the NEW turns
//   (`system` and `user` roles); the server prepends its stored history. So each
//   chat in this app is mapped, per device, to an Aureon conversation id. A chat
//   that already had turns before it was first sent to Aureon gets them once,
//   as a transcript inside the system message.
// • The stream's events are `meta` / `token` / `done` / `error` (named SSE
//   events), not the proxy's `data: {"text": …}` lines. `streamChat` turns them
//   into the same small event shape the proxy produced.
//
// Requires an Aureon session (stage 2, VITE_AUTH_PROVIDER=aureon): the request
// is cookie-authenticated with the CSRF header.

import { reactive, watch } from 'vue'
import { aureon } from '@/api/client'
import { apiUrl } from '@/api/config'
import { readCsrfToken } from '@/api/csrf'
import { readSse } from '@/api/sse'

export type AiBackend = 'proxy' | 'aureon'

export function aiBackend(env: string | undefined = import.meta.env.VITE_AI_BACKEND): AiBackend {
  return String(env ?? '')
    .trim()
    .toLowerCase() === 'proxy'
    ? 'proxy'
    : 'aureon'
}

/** Per-field limit on the server (ChatMessageIn.content). */
export const MAX_CONTENT = 32_000

// --- the model choice and the chat → conversation map (per device) -----------------------

const MODEL_KEY = 'aureon.ai.ollamaModel'
const CONV_KEY = 'aureon.ai.conversations'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private window: holds for this visit */
  }
}

export const aureonAi = reactive({
  model: read<string>(MODEL_KEY, ''),
  conversations: read<Record<string, string>>(CONV_KEY, {}),
})
watch(
  () => aureonAi.model,
  (m) => write(MODEL_KEY, m),
)
watch(
  () => aureonAi.conversations,
  (c) => write(CONV_KEY, c),
  { deep: true },
)

export interface LocalModel {
  name: string
  family: string | null
  parameterSize: string | null
  quantization: string | null
  size: number | null
}

/** Models installed in the local Ollama; picks the first when none is chosen yet. */
export async function listModels(): Promise<LocalModel[]> {
  const { data, error } = await aureon.GET('/api/models')
  if (!data) throw new Error(error ? 'Could not list local models.' : 'No answer from Aureon.')
  const models = data.models.map((m) => ({
    name: m.name,
    family: m.family ?? null,
    parameterSize: m.parameter_size ?? null,
    quantization: m.quantization ?? null,
    size: m.size ?? null,
  }))
  if (models.length && !models.some((m) => m.name === aureonAi.model)) {
    aureonAi.model = models[0].name
  }
  return models
}

// --- the stream ------------------------------------------------------------------------------

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** Same shape the proxy's events were read into. */
export interface ChatEvent {
  model?: string
  text?: string
  usage?: { in: number; out: number }
  error?: string
}

function clip(text: string): string {
  return text.length > MAX_CONTENT ? text.slice(0, MAX_CONTENT - 20) + '\n…[truncated]' : text
}

function transcript(turns: ChatTurn[]): string {
  return turns
    .filter((t) => t.role !== 'system' && t.content.trim())
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content.trim()}`)
    .join('\n\n')
}

/** The request body for one turn. Exported for the tests. */
export function buildMessages(
  system: string,
  history: ChatTurn[],
  prompt: string,
  hasConversation: boolean,
): { role: 'system' | 'user'; content: string }[] {
  const parts = [system.trim()]
  // Only on the first Aureon turn of a chat that already had turns elsewhere.
  if (!hasConversation && history.length) {
    parts.push(`Conversation so far:\n\n${transcript(history)}`)
  }
  const sys = parts.filter(Boolean).join('\n\n')
  return [
    ...(sys ? [{ role: 'system' as const, content: clip(sys) }] : []),
    { role: 'user', content: clip(prompt) },
  ]
}

export class AureonChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function httpMessage(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (status === 401) return 'Sign in to Aureon to use the local AI.'
  if (status === 404) {
    const avail = (body as { available?: string[] } | null)?.available
    return avail?.length
      ? `That model is not installed. Installed: ${avail.join(', ')}.`
      : 'That model is not installed in the local Ollama.'
  }
  if (status === 429) return 'The local AI is busy with other replies. Try again in a moment.'
  if (status === 503) return typeof detail === 'string' ? detail : 'The local AI is unavailable.'
  return typeof detail === 'string' ? detail : `Aureon error ${status}`
}

/**
 * One turn against POST /api/chat. Yields text as it streams. `chatKey` maps the
 * app's chat to its Aureon conversation (null for a one-off ask, which starts a
 * fresh conversation every time).
 */
export async function* streamChat(opts: {
  model: string
  system: string
  history: ChatTurn[]
  prompt: string
  chatKey: string | null
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}): AsyncGenerator<ChatEvent> {
  const doFetch = opts.fetchImpl ?? fetch
  const conversationId = opts.chatKey ? aureonAi.conversations[opts.chatKey] : undefined
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  const csrf = readCsrfToken()
  if (csrf) headers['X-CSRF-Token'] = csrf
  const res = await doFetch(apiUrl('/api/chat'), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      model: opts.model,
      ...(conversationId ? { conversation_id: conversationId } : {}),
      messages: buildMessages(opts.system, opts.history, opts.prompt, !!conversationId),
    }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    // A conversation deleted on the server: forget it and let the caller retry fresh.
    if (res.status === 404 && conversationId && opts.chatKey) {
      delete aureonAi.conversations[opts.chatKey]
    }
    const body = await res.json().catch(() => null)
    throw new AureonChatError(httpMessage(res.status, body), res.status)
  }
  for await (const ev of readSse(res)) {
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(ev.data) as Record<string, unknown>
    } catch {
      continue
    }
    if (ev.event === 'meta') {
      if (opts.chatKey && typeof data.conversation_id === 'string') {
        aureonAi.conversations[opts.chatKey] = data.conversation_id
      }
      yield { model: String(data.model ?? opts.model) }
    } else if (ev.event === 'token') {
      if (typeof data.content === 'string' && data.content) yield { text: data.content }
    } else if (ev.event === 'done') {
      yield {
        usage: { in: Number(data.prompt_tokens ?? 0), out: Number(data.completion_tokens ?? 0) },
      }
      return
    } else if (ev.event === 'error') {
      yield { error: String(data.message ?? data.code ?? 'The local model stopped.') }
      return
    }
  }
}

/** The whole answer to one question (prompt helpers). */
export async function askOnce(
  system: string,
  text: string,
  opts: { model: string; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<string | null> {
  let answer = ''
  for await (const ev of streamChat({
    ...opts,
    system,
    history: [],
    prompt: text,
    chatKey: null,
  })) {
    if (ev.error) return null
    if (ev.text) answer += ev.text
  }
  return answer
}
