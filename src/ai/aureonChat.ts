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
//
// Providers (backend docs/25-openrouter.md): each conversation picks a provider
// and model — the local Ollama or an allowed OpenRouter model — from
// GET /api/models/catalog. The browser never talks to OpenRouter and never sees
// its key: the server routes, filters (finance, trading, broker, positions,
// secrets and logs always stay local) and falls back to the local model on any
// error. Every stream says who actually answered and why (`AiRoute`).
//
// Thinking (backend docs/26): with `think: true` the server asks the model for its
// reasoning (OpenRouter `reasoning`, Ollama `think`) and streams it as separate
// `thinking` events, never mixed into the answer. src/ai/steps.ts turns the whole
// stream into the execution steps the chat shows.

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

export type AiProvider = 'ollama' | 'openrouter'

/** A provider + model pick. */
export interface AiTarget {
  provider: AiProvider
  model: string
}

export interface CatalogModel {
  provider: AiProvider
  id: string
  label: string
}

export interface ModelCatalog {
  default: { provider: AiProvider; model: string | null }
  localFallbackModel: string | null
  ollamaReachable: boolean
  models: CatalogModel[]
  /** null = OpenRouter is usable; else why every turn stays local. */
  openrouterOff: string | null
}

export interface AiUsageInfo {
  day: string
  spentUsd: number
  limitUsd: number
  remainingUsd: number
  tokens: number
  calls: number
  capReached: boolean
  available: boolean
}

/** Who answered a turn and why — from the stream's meta/fallback/done events. */
export interface AiRoute {
  provider: AiProvider
  model: string
  requestedProvider?: AiProvider
  /** Why it is not OpenRouter although OpenRouter was picked (null = it is). */
  fallbackReason?: string | null
  /** The data had to stay local (the classification filter or a linked context). */
  localOnly?: boolean
  costUsd?: string | null
  /** What the classification filter found (it is why a turn stayed local). */
  filterCategories?: string[]
}

const TARGET_KEY = 'aureon.ai.targets'
const THINK_KEY = 'aureon.ai.think'

export const aureonAi = reactive({
  model: read<string>(MODEL_KEY, ''),
  conversations: read<Record<string, string>>(CONV_KEY, {}),
  /** The provider + model each chat uses, by chat key (per device). */
  targets: read<Record<string, AiTarget>>(TARGET_KEY, {}),
  /** Picked while no chat is open: the next new chat takes it. */
  pending: null as AiTarget | null,
  catalog: null as ModelCatalog | null,
  usage: null as AiUsageInfo | null,
  /** Ask the model for its reasoning and show it (a preference, per device). */
  think: read<boolean>(THINK_KEY, false),
})
watch(
  () => aureonAi.think,
  (t) => write(THINK_KEY, t),
)
watch(
  () => aureonAi.targets,
  (t) => write(TARGET_KEY, t),
  { deep: true },
)
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

/** The picker's list (local models, then allowed OpenRouter ones) and the server default. */
export async function loadCatalog(): Promise<ModelCatalog> {
  const { data, error } = await aureon.GET('/api/models/catalog')
  if (!data) throw new Error(error ? 'Could not list models.' : 'No answer from Aureon.')
  const catalog: ModelCatalog = {
    default: { provider: data.default.provider, model: data.default.model ?? null },
    localFallbackModel: data.local_fallback_model ?? null,
    ollamaReachable: data.ollama_reachable,
    models: data.models.map((m) => ({ provider: m.provider, id: m.id, label: m.label })),
    openrouterOff: data.openrouter.unavailable_reason ?? null,
  }
  aureonAi.catalog = catalog
  const local = catalog.models.filter((m) => m.provider === 'ollama')
  // The prompt helpers and the typo sweep stay on the local model.
  if (local.length && !local.some((m) => m.id === aureonAi.model)) {
    aureonAi.model = local.find((m) => m.id === catalog.localFallbackModel)?.id ?? local[0].id
  }
  return catalog
}

/** Today's OpenRouter spend against the daily cap. */
export async function loadUsage(): Promise<AiUsageInfo | null> {
  const { data } = await aureon.GET('/api/ai/usage')
  if (!data) return null
  const num = (v: string | number) => Number(v) || 0
  aureonAi.usage = {
    day: data.day,
    spentUsd: num(data.spent_usd),
    limitUsd: num(data.limit_usd),
    remainingUsd: num(data.remaining_usd),
    tokens: data.prompt_tokens + data.completion_tokens,
    calls: data.calls,
    capReached: data.cap_reached,
    available: data.available ?? true,
  }
  return aureonAi.usage
}

/**
 * The provider + model a chat sends with. Its own pick first; a chat that
 * already has a server conversation from before providers existed stays on the
 * local model; a new chat takes the pending pick, then the server default.
 * null = send neither and let the server decide.
 */
export function targetFor(chatKey: string | null): AiTarget | null {
  if (chatKey && aureonAi.targets[chatKey]) return aureonAi.targets[chatKey]
  if (chatKey && aureonAi.conversations[chatKey]) {
    return aureonAi.model ? { provider: 'ollama', model: aureonAi.model } : null
  }
  if (aureonAi.pending) return aureonAi.pending
  const d = aureonAi.catalog?.default
  if (d?.model) return { provider: d.provider, model: d.model }
  return aureonAi.model ? { provider: 'ollama', model: aureonAi.model } : null
}

/** Pick a provider + model for a chat (or for the next new chat). */
export function setTarget(chatKey: string | null, target: AiTarget) {
  if (chatKey) aureonAi.targets[chatKey] = target
  else aureonAi.pending = target
  if (target.provider === 'ollama') aureonAi.model = target.model
}

const REASONS: Record<string, string> = {
  filter: 'the message has data that stays on this server',
  context: 'this chat is linked to finance, trading or research',
  disabled: 'OpenRouter is turned off on the server',
  not_configured: 'OpenRouter is not set up on the server',
  no_budget: 'OpenRouter has no daily budget',
  daily_cap_reached: "today's OpenRouter budget is used up",
  monthly_cap_reached: "this month's AI budget is used up",
  usage_unavailable: "today's OpenRouter spend could not be checked",
  model_not_allowed: 'that OpenRouter model is not allowed',
  rate_limited: 'OpenRouter is rate-limiting',
  upstream_error: 'OpenRouter had an error',
  rejected: 'OpenRouter refused the request',
  timeout: 'OpenRouter timed out',
  unavailable: 'OpenRouter could not be reached',
}

/** Why a turn ran locally, in words. */
export function fallbackText(reason: string | null | undefined): string {
  if (!reason) return ''
  return REASONS[reason] ?? reason.replace(/_/g, ' ')
}

/** "OpenRouter · google/gemini-2.5-flash-lite" / "Local · qwen2.5:3b". */
export function targetLabel(t: { provider: AiProvider; model: string }): string {
  return `${t.provider === 'openrouter' ? 'OpenRouter' : 'Local'} · ${t.model}`
}

// --- the stream ------------------------------------------------------------------------------

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** Same shape the proxy's events were read into, plus who answered. */
export interface ChatEvent {
  model?: string
  text?: string
  usage?: { in: number; out: number }
  error?: string
  /** Who answers (meta, fallback) / answered (done, error). */
  route?: AiRoute
  /** OpenRouter failed mid-reply: drop the text so far, the local answer follows. */
  reset?: boolean
  /** A piece of the model's reasoning (only when asked with `think`). */
  thinking?: string
  /** On done: how long the server took, and reasoning tokens when reported. */
  durationMs?: number
  reasoningTokens?: number | null
}

function routeOf(data: Record<string, unknown>, fallbackModel: string): AiRoute {
  const provider: AiProvider = data.provider === 'openrouter' ? 'openrouter' : 'ollama'
  const reason = (data.fallback_reason ?? data.reason ?? null) as string | null
  return {
    provider,
    model: String(data.model ?? fallbackModel),
    requestedProvider:
      data.requested_provider === 'openrouter' || data.requested_provider === 'ollama'
        ? data.requested_provider
        : undefined,
    fallbackReason: reason,
    localOnly: data.local_only === true,
    costUsd: typeof data.cost_usd === 'string' ? data.cost_usd : null,
    filterCategories: Array.isArray(data.filter_categories)
      ? data.filter_categories.filter((c): c is string => typeof c === 'string')
      : [],
  }
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
  if (status === 404 && typeof detail === 'string' && detail.includes('OpenRouter')) return detail
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
  /** Omitted: a local model name, as before. */
  provider?: AiProvider
  system: string
  history: ChatTurn[]
  prompt: string
  chatKey: string | null
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  /** Ask for the model's reasoning; it arrives as `thinking` events. */
  think?: boolean
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
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(opts.think ? { think: true } : {}),
      messages: buildMessages(opts.system, opts.history, opts.prompt, !!conversationId),
    }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null)
    // A conversation deleted on the server: forget it and let the caller retry fresh.
    const gone = (body as { detail?: unknown } | null)?.detail === 'conversation not found'
    if (res.status === 404 && gone && conversationId && opts.chatKey) {
      delete aureonAi.conversations[opts.chatKey]
    }
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
      yield { model: String(data.model ?? opts.model), route: routeOf(data, opts.model) }
    } else if (ev.event === 'fallback') {
      const route = routeOf(data, opts.model)
      yield { model: route.model, route, reset: data.reset === true }
    } else if (ev.event === 'token') {
      if (typeof data.content === 'string' && data.content) yield { text: data.content }
    } else if (ev.event === 'thinking') {
      if (typeof data.content === 'string' && data.content) yield { thinking: data.content }
    } else if (ev.event === 'done') {
      yield {
        usage: { in: Number(data.prompt_tokens ?? 0), out: Number(data.completion_tokens ?? 0) },
        ...(typeof data.duration_ms === 'number' ? { durationMs: data.duration_ms } : {}),
        ...(typeof data.reasoning_tokens === 'number'
          ? { reasoningTokens: data.reasoning_tokens }
          : {}),
        ...('provider' in data ? { route: routeOf(data, opts.model) } : {}),
      }
      return
    } else if (ev.event === 'error') {
      yield {
        error: String(data.message ?? data.code ?? 'The model stopped.'),
        ...('provider' in data ? { route: routeOf(data, opts.model) } : {}),
      }
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
  // Prompt helpers stay on the local model.
  for await (const ev of streamChat({
    ...opts,
    provider: 'ollama',
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
