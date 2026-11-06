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
import { aureon, type components } from '@/api/client'
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

// Four providers (backend docs/26-ai-providers.md): the local Ollama, and three
// external ones behind the same server-side gate. The browser only ever names
// one; it never holds a key and never calls a provider itself.
export const AI_PROVIDERS = ['ollama', 'openrouter', 'anthropic', 'gemini'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]
export type ExternalProvider = Exclude<AiProvider, 'ollama'>
export const EXTERNAL_PROVIDERS: readonly ExternalProvider[] = ['openrouter', 'anthropic', 'gemini']

export function isProvider(v: unknown): v is AiProvider {
  return typeof v === 'string' && (AI_PROVIDERS as readonly string[]).includes(v)
}

/** The short name a person reads: "Local", "OpenRouter", "Claude", "Gemini". */
export const PROVIDER_NAME: Record<AiProvider, string> = {
  ollama: 'Local',
  openrouter: 'OpenRouter',
  anthropic: 'Claude',
  gemini: 'Gemini',
}

/** A provider + model pick. */
export interface AiTarget {
  provider: AiProvider
  model: string
}

export interface CatalogModel {
  provider: AiProvider
  id: string
  label: string
  /** False: listed so it can be seen, but not selectable (e.g. an unpriced model). */
  available: boolean
  unavailableReason: string | null
  capabilities: string[]
  /** local = never leaves the server; external = only after the server's privacy gate. */
  privacy: 'local' | 'external'
}

/** One provider's state, from the catalog's `providers[]`. Never a key. */
export interface ProviderInfo {
  provider: AiProvider
  label: string
  enabled: boolean
  /** A key is set on the server (not that the key works). */
  configured: boolean
  usable: boolean
  /** null = usable. disabled | not_configured | no_budget | unreachable … */
  unavailableReason: string | null
  defaultModel: string | null
  allowedModels: string[]
  dailyLimitUsd: string | null
  costSource: 'provider' | 'configured_price' | 'none'
  privacy: 'local' | 'external'
}

export interface ModelCatalog {
  default: { provider: AiProvider; model: string | null }
  localFallbackModel: string | null
  ollamaReachable: boolean
  models: CatalogModel[]
  /** null = OpenRouter is usable; else why every turn stays local. */
  openrouterOff: string | null
  /** Every provider, local first. Derived from `openrouter` on an older server. */
  providers: ProviderInfo[]
  defaultExternalProvider: string | null
  globalDailyLimitUsd: string | null
}

export interface AiUsageInfo {
  provider: ExternalProvider
  day: string
  spentUsd: number
  limitUsd: number
  remainingUsd: number
  tokens: number
  calls: number
  capReached: boolean
  available: boolean
  /** AI_EXTERNAL_DAILY_LIMIT_USD (null = per-provider caps only) and today's total. */
  globalLimitUsd: number | null
  globalSpentUsd: number | null
}

/** Who answered a turn and why — from the stream's meta/fallback/done events. */
export interface AiRoute {
  provider: AiProvider
  model: string
  requestedProvider?: AiProvider
  requestedModel?: string
  /** On a switch between external providers (backend docs/30): the one that failed. */
  fromProvider?: AiProvider
  /** Why the requested external provider did not answer (null = it did). */
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

type CatalogData = components['schemas']['ModelCatalog']

/**
 * The server's catalog in the app's shape. Pure, for the tests.
 *
 * Everything comes from the response: no model list is built in, and a model
 * the server marks unavailable stays unavailable. An older server (no
 * `providers[]`, no per-model `available`) still maps: its models are all
 * selectable, as they were, and the providers are derived from `openrouter`.
 */
export function mapCatalog(data: CatalogData): ModelCatalog {
  const models: CatalogModel[] = data.models
    .filter((m) => isProvider(m.provider))
    .map((m) => ({
      provider: m.provider,
      id: m.id,
      label: m.label,
      available: m.available ?? true,
      unavailableReason: m.unavailable_reason ?? null,
      capabilities: m.capabilities ?? ['chat', 'streaming'],
      privacy: m.privacy ?? (m.provider === 'ollama' ? 'local' : 'external'),
    }))
  const providers: ProviderInfo[] = data.providers?.length
    ? data.providers
        .filter((p) => isProvider(p.provider))
        .map((p) => ({
          provider: p.provider,
          label: p.label,
          enabled: p.enabled,
          configured: p.configured,
          usable: p.usable,
          unavailableReason: p.unavailable_reason ?? null,
          defaultModel: p.default_model ?? null,
          allowedModels: p.allowed_models ?? [],
          dailyLimitUsd: p.daily_limit_usd ?? null,
          costSource: p.cost_source,
          privacy: p.privacy,
        }))
    : legacyProviders(data, models)
  return {
    default: { provider: data.default.provider, model: data.default.model ?? null },
    localFallbackModel: data.local_fallback_model ?? null,
    ollamaReachable: data.ollama_reachable,
    models,
    openrouterOff: data.openrouter.unavailable_reason ?? null,
    providers,
    defaultExternalProvider: data.default_external_provider ?? null,
    globalDailyLimitUsd: data.global_daily_limit_usd ?? null,
  }
}

/** A server from before docs/26 knows two providers; say only what it said. */
function legacyProviders(data: CatalogData, models: CatalogModel[]): ProviderInfo[] {
  const ids = (p: AiProvider) => models.filter((m) => m.provider === p).map((m) => m.id)
  const local = ids('ollama')
  const orOff = data.openrouter.unavailable_reason ?? null
  return [
    {
      provider: 'ollama',
      label: 'Local (Ollama)',
      enabled: true,
      configured: true,
      usable: data.ollama_reachable,
      unavailableReason: data.ollama_reachable ? null : 'unreachable',
      defaultModel: data.local_fallback_model ?? local[0] ?? null,
      allowedModels: local,
      dailyLimitUsd: null,
      costSource: 'none',
      privacy: 'local',
    },
    {
      provider: 'openrouter',
      label: 'OpenRouter',
      enabled: data.openrouter.enabled,
      // The old status never said whether a key is set; only that it is usable.
      configured: orOff !== 'not_configured',
      usable: orOff === null,
      unavailableReason: orOff,
      defaultModel: data.default.provider === 'openrouter' ? (data.default.model ?? null) : null,
      allowedModels: ids('openrouter'),
      dailyLimitUsd: null,
      costSource: 'provider',
      privacy: 'external',
    },
  ]
}

/** The picker's list and the server default. */
export async function loadCatalog(): Promise<ModelCatalog> {
  const { data, error } = await aureon.GET('/api/models/catalog')
  if (!data) throw new Error(error ? 'Could not list models.' : 'No answer from Aureon.')
  const catalog = mapCatalog(data)
  aureonAi.catalog = catalog
  const local = catalog.models.filter((m) => m.provider === 'ollama')
  // The prompt helpers and the typo sweep stay on the local model.
  if (local.length && !local.some((m) => m.id === aureonAi.model)) {
    aureonAi.model = local.find((m) => m.id === catalog.localFallbackModel)?.id ?? local[0].id
  }
  return catalog
}

/**
 * Today's spend of one external provider (OpenRouter by default, as before)
 * against its daily cap, and the total against the shared cap.
 */
export async function loadUsage(
  provider: ExternalProvider = 'openrouter',
): Promise<AiUsageInfo | null> {
  // No query for OpenRouter: an older server has no `provider` parameter.
  const { data } = await aureon.GET(
    '/api/ai/usage',
    provider === 'openrouter' ? {} : { params: { query: { provider } } },
  )
  if (!data) return null
  const num = (v: string | number) => Number(v) || 0
  const opt = (v: string | null | undefined) => (v == null ? null : num(v))
  aureonAi.usage = {
    provider: data.provider ?? provider,
    globalLimitUsd: opt(data.global_limit_usd),
    globalSpentUsd: opt(data.global_spent_usd),
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
 * already has a server conversation and no pick sends neither, so the server
 * keeps the conversation's own provider (a conversation from before providers
 * existed is stored as local there, so it stays local); a new chat takes the
 * pending pick, then the server default. null = send neither and let the
 * server decide.
 *
 * Before, such a chat was always sent as local Ollama, which moved every older
 * Gemini/OpenRouter chat to the local model.
 */
export function targetFor(chatKey: string | null): AiTarget | null {
  if (chatKey && aureonAi.targets[chatKey]) return aureonAi.targets[chatKey]
  if (chatKey && aureonAi.conversations[chatKey]) return null
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

// The server's gate and error codes (docs/26 "The gate, in order"), in words.
// `{p}` is the provider that was asked for. These are fixed strings: the
// server's own messages are never shown, because an upstream body can echo the
// prompt or internal detail.
const REASONS: Record<string, string> = {
  filter: 'the message has data that stays on this server',
  context: 'this chat is linked to finance, trading or research',
  disabled: '{p} is turned off on the server',
  not_configured: '{p} is not set up on the server',
  no_budget: '{p} has no daily budget',
  model_not_allowed: 'that {p} model is not allowed',
  no_pricing: 'that {p} model has no price set, so it is never used',
  daily_cap_reached: "today's {p} budget is used up",
  global_cap_reached: "today's shared budget for external AI is used up",
  monthly_cap_reached: "this month's AI budget is used up",
  usage_unavailable: "today's {p} spend could not be checked",
  rate_limited_local: 'too many {p} requests from this server this minute',
  rate_limited: '{p} is rate-limiting',
  upstream_error: '{p} had an error',
  rejected: '{p} refused the request (key, model or credit)',
  refused: "{p}'s safety filter declined",
  timeout: '{p} timed out',
  unavailable: '{p} could not be reached',
  unreachable: 'the local model server could not be reached',
}

/**
 * Why a turn ran locally, in words. `provider` is the one that was asked for
 * (OpenRouter when not known, as on a server from before docs/26).
 */
export function fallbackText(
  reason: string | null | undefined,
  provider: AiProvider = 'openrouter',
): string {
  if (!reason) return ''
  const name = provider === 'ollama' ? 'the external provider' : PROVIDER_NAME[provider]
  const text = REASONS[reason]
  // An unknown code is shown as words, never as a server message.
  return text ? text.replace('{p}', name) : reason.replace(/[^a-z0-9]+/gi, ' ').trim()
}

/** A stored reply's route (src/types.ts AiMessage['route']). */
export interface ReplyRoute {
  provider: AiProvider
  requestedProvider?: AiProvider
  requestedModel?: string
  fromProvider?: AiProvider
  fallbackReason?: string | null
  localOnly?: boolean
}

/** A model id as the badge shows it: "gemini-2.5-flash", "qwen2.5:3b" (no vendor prefix). */
export function shortModel(model: string | undefined): string {
  return (
    (model ?? '')
      .replace(/^models\//, '')
      .split('/')
      .pop() ?? ''
  )
}

export type ReplyBadge =
  | { kind: 'external'; label: string; title: string }
  | { kind: 'local-only'; label: string; title: string }
  | { kind: 'fallback'; label: string; title: string }
  | { kind: 'local'; label: string; title: string }

/**
 * The one badge that says who wrote a reply, so a local (Qwen) answer and an
 * external (Gemini, Claude, OpenRouter) one never look alike. `provider` is who
 * ACTUALLY answered (the stream's meta/fallback/done event), never the chat's
 * selection, and the label names the model that wrote it ("Gemini ·
 * gemini-2.5-flash", "Local · qwen2.5:3b"). Null when the reply carries no route
 * (an older message, or the non-Aureon backend): then nothing is claimed.
 */
export function replyBadge(route: ReplyRoute | undefined, model?: string): ReplyBadge | null {
  if (!route) return null
  const m = model ? ` (${model})` : ''
  const short = shortModel(model)
  const withModel = (head: string) => (short ? `${head} · ${short}` : head)
  const asked = route.requestedProvider
  const reason = route.fallbackReason ?? null
  if (route.provider !== 'ollama') {
    const name = PROVIDER_NAME[route.provider]
    // Another external provider answered instead of the one asked (backend docs/30).
    const from =
      route.fromProvider && route.fromProvider !== route.provider
        ? route.fromProvider
        : asked && asked !== 'ollama' && asked !== route.provider
          ? asked
          : null
    if (from) {
      const why = fallbackText(reason, from)
      return {
        kind: 'external',
        label: withModel(`${PROVIDER_NAME[from]} → ${name}`),
        title: `Answered by ${name}${m} (external) instead of ${PROVIDER_NAME[from]}${why ? `: ${why}` : ''}`,
      }
    }
    return {
      kind: 'external',
      label: withModel(name),
      title: `Answered by ${name}${m} (external), through the Aureon server`,
    }
  }
  if (route.localOnly) {
    return {
      kind: 'local-only',
      label: withModel('Local only'),
      title: `Answered by the local model${m}. Kept on this server: ${fallbackText(reason, asked)}`,
    }
  }
  // An external provider was asked for and the local model answered instead. A
  // provider that is switched off counts too: the person picked it, so they are told.
  const switched = !!asked && asked !== 'ollama'
  if (switched || (reason && reason !== 'disabled')) {
    const why = fallbackText(reason, asked)
    const head = switched ? `${PROVIDER_NAME[asked!]} → local` : 'Fell back to local'
    return {
      kind: 'fallback',
      label: why ? `${head} · ${why}` : head,
      title: `Answered by the local model${m}${switched ? ` instead of ${PROVIDER_NAME[asked!]}${route.requestedModel ? ` (${route.requestedModel})` : ''}` : ''}${why ? `: ${why}` : ''}`,
    }
  }
  return {
    kind: 'local',
    label: withModel('Local'),
    title: `Answered by the local model${m} on the Aureon server (Ollama)`,
  }
}

/** "OpenRouter · google/gemini-2.5-flash-lite" / "Claude · claude-…" / "Local · qwen2.5:3b". */
export function targetLabel(t: { provider: AiProvider; model: string }): string {
  return `${PROVIDER_NAME[t.provider] ?? 'Local'} · ${t.model}`
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
  /** The external provider failed mid-reply: drop the text so far, the local answer follows. */
  reset?: boolean
  /** A piece of the model's reasoning (only when asked with `think`). */
  thinking?: string
  /** On done: how long the server took, and reasoning tokens when reported. */
  durationMs?: number
  reasoningTokens?: number | null
}

/**
 * Who answered, from a meta / fallback / done / error event. Exported for the tests.
 *
 * `provider` is who ACTUALLY answered; `requestedProvider` is who was asked;
 * `fromProvider` is the external provider that failed when the server moved to
 * the next one (backend docs/30). An unknown provider is read as local.
 */
export function routeOf(
  data: Record<string, unknown>,
  fallbackModel: string,
  askedProvider?: AiProvider,
): AiRoute {
  const provider: AiProvider = isProvider(data.provider) ? data.provider : 'ollama'
  // The requested model only stands in for a missing `model` when the provider that
  // answered is the one that was asked. A fallback without a model is "not
  // reported", never the requested (e.g. Gemini) model on a local (Qwen) reply.
  const sent = typeof data.model === 'string' && data.model ? data.model : null
  const model = sent ?? (!askedProvider || askedProvider === provider ? fallbackModel : '')
  const raw = data.fallback_reason ?? data.reason ?? null
  const reason = typeof raw === 'string' ? raw : null
  return {
    provider,
    model,
    requestedProvider: isProvider(data.requested_provider) ? data.requested_provider : undefined,
    requestedModel: typeof data.requested_model === 'string' ? data.requested_model : undefined,
    ...(isProvider(data.from_provider) ? { fromProvider: data.from_provider } : {}),
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
  // "model 'x' is not an allowed Anthropic model": the server's fixed wording, no body echo.
  if (status === 404 && typeof detail === 'string' && /not an allowed \w+ model/.test(detail)) {
    return detail
  }
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
      const route = routeOf(data, opts.model, opts.provider)
      yield { model: route.model, route }
    } else if (ev.event === 'fallback') {
      const route = routeOf(data, opts.model, opts.provider)
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
        ...('provider' in data ? doneRoute(data, opts.model, opts.provider) : {}),
      }
      return
    } else if (ev.event === 'error') {
      yield {
        error: String(data.message ?? data.code ?? 'The model stopped.'),
        ...('provider' in data ? doneRoute(data, opts.model, opts.provider) : {}),
      }
      return
    }
  }
}

/** The final word on who answered: the route, and its model when the server named one. */
function doneRoute(data: Record<string, unknown>, model: string, provider?: AiProvider) {
  const route = routeOf(data, model, provider)
  return typeof data.model === 'string' && data.model ? { route, model: route.model } : { route }
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
