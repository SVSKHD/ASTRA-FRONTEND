// The AI tab on Aureon: Claude, through the server's gateway (backend
// docs/26-ai-providers.md). The browser never holds a key and never calls
// Anthropic; it talks only to /api/ai/* with its session cookie and CSRF header.
//
//   VITE_AI_BACKEND=aureon   (default) POST /api/ai/chat, Claude behind the server
//   VITE_AI_BACKEND=proxy    the Netlify function, as before (a Netlify-hosted build)
//
// The server owns everything about a turn: the agent's system prompt, the
// conversation's history (replayed from `conversation_id`), the tools and the
// budget. A request carries one message and, optionally, the agent to use.
//
// The stream's named events (src/api/sse.ts reads them):
//   meta      {conversation_id, agent}          the agent that answers
//   text      {delta}                           a piece of the answer
//   tool      {name, status}                    a tool the agent used
//   approval  {id, action, summary}             a write it asked to make
//   suggestion {kind, fields}                  a todo/task/reminder/event/note card:
//                                               saved only if the user confirms it
//   done      {conversation_id, message_id, cost_usd, steps, stop_reason, approvals[]}
//   error     {code, message}
// plus `: ping` comments while the agent works. `streamChat` turns them into
// the small event shape below; src/ai/steps.ts folds them into the visible steps.

import { isSuggestion, type Suggestion, type WorkspaceIn } from '@/ai/workspace'
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

/** The server's limit on one message (ChatIn.message). */
export const MAX_CONTENT = 20_000

// --- agents -----------------------------------------------------------------------------------

/** The agents a chat can ask for. Omitted (Auto) = the server's router picks one. */
export const AI_AGENTS = ['investments', 'business', 'general'] as const
export type AiAgent = (typeof AI_AGENTS)[number]
/** What the picker offers: an agent, or `auto`. */
export type AgentPick = AiAgent | 'auto'

export function isAgent(v: unknown): v is AiAgent {
  return typeof v === 'string' && (AI_AGENTS as readonly string[]).includes(v)
}

export const AGENT_LABEL: Record<AgentPick, string> = {
  auto: 'Auto',
  investments: 'Investments',
  business: 'Business',
  general: 'General',
}

export const AGENT_HINT: Record<AgentPick, string> = {
  auto: 'The server picks the agent from your message',
  investments: 'Portfolio, positions, screener and the MT5 bot; can propose paper trades',
  business: 'Aquakart and Pawsattva questions',
  general: 'Everything else',
}

/** "Investments" for a known agent, the raw name otherwise (e.g. "report"). */
export function agentLabel(agent: string | null | undefined): string {
  if (!agent) return ''
  return agent in AGENT_LABEL
    ? AGENT_LABEL[agent as AgentPick]
    : agent.charAt(0).toUpperCase() + agent.slice(1)
}

// --- per-device state: chat → conversation, chat → agent pick ---------------------------------

// A new key: conversation ids from the old /api/chat are not conversations on
// /api/ai, so an old mapping would only ever answer `not_found`.
const CONV_KEY = 'aureon.ai.claudeConversations'
const AGENT_KEY = 'aureon.ai.agents'

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
  /** The server conversation each chat continues, by chat key. */
  conversations: read<Record<string, string>>(CONV_KEY, {}),
  /** The agent each chat asks for, by chat key; absent = Auto. */
  agents: read<Record<string, AiAgent>>(AGENT_KEY, {}),
  /** Picked while no chat is open: the next new chat takes it. */
  pending: 'auto' as AgentPick,
})
watch(
  () => aureonAi.conversations,
  (c) => write(CONV_KEY, c),
  { deep: true },
)
watch(
  () => aureonAi.agents,
  (a) => write(AGENT_KEY, a),
  { deep: true },
)

/** The agent a chat asks for: its own pick, else the pending pick for a new chat. */
export function agentFor(chatKey: string | null): AgentPick {
  if (chatKey && aureonAi.agents[chatKey]) return aureonAi.agents[chatKey]
  if (chatKey && aureonAi.conversations[chatKey]) return 'auto'
  return aureonAi.pending
}

/** Pick the agent for a chat (or for the next new chat). */
export function setAgent(chatKey: string | null, pick: AgentPick) {
  if (!chatKey) {
    aureonAi.pending = pick
    return
  }
  if (pick === 'auto') delete aureonAi.agents[chatKey]
  else aureonAi.agents[chatKey] = pick
}

// --- tools, in words ---------------------------------------------------------------------------

/** [while working, once done] for the tools the server registers (docs/26 "Agents and tools"). */
const TOOL_WORDS: Record<string, [string, string]> = {
  get_portfolio_summary: ['Checking the portfolio summary', 'Checked the portfolio summary'],
  get_positions: ['Reading positions', 'Read positions'],
  get_dhan_screener_results: ['Reading screener results', 'Read screener results'],
  get_mt5_bot_status: ['Checking the MT5 bot', 'Checked the MT5 bot'],
  get_mt5_recent_signals: ['Reading MT5 signals', 'Read MT5 signals'],
  propose_trade: ['Proposing a trade', 'Proposed a trade'],
  get_aquakart_sales_summary: ['Reading Aquakart sales', 'Read Aquakart sales'],
  get_aquakart_open_queries: ['Reading Aquakart queries', 'Read Aquakart queries'],
  get_pawsattva_summary: ['Reading the Pawsattva summary', 'Read the Pawsattva summary'],
  draft_aquakart_blog: ['Drafting a blog post', 'Drafted a blog post'],
  get_todos: ['Reading todos', 'Read todos'],
  add_todo: ['Adding a todo', 'Asked to add a todo'],
}

function humanTool(name: string): string {
  const words = name.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'A tool'
}

/** "Reading positions…" — a tool's quiet activity line while the agent keeps working. */
export function toolActivity(name: string): string {
  return `${TOOL_WORDS[name]?.[0] ?? `Using ${humanTool(name).toLowerCase()}`}…`
}

/** "Read positions" / "Proposed a trade — awaiting your approval" / "… (refused)". */
export function toolDone(name: string, status: string): string {
  const base = TOOL_WORDS[name]?.[1] ?? `Used ${humanTool(name).toLowerCase()}`
  if (status === 'awaiting_approval') return `${base} — awaiting your approval`
  if (status === 'refused') return `${base} (refused)`
  if (status === 'error') return `${base} (failed)`
  return base
}

// --- errors, in words ---------------------------------------------------------------------------

/**
 * The server's error codes (POST /api/ai/chat), in fixed words. The server's own
 * message is never shown for a known code: an upstream message can echo input.
 */
const ERROR_TEXT: Record<string, string> = {
  ai_not_configured:
    'Claude is not set up on the server yet: add ANTHROPIC_API_KEY in Settings → AI.',
  ai_paused: 'The AI is paused on the server. Resume the Claude agent from the agents page.',
  budget_exceeded: 'This month’s AI budget is used up, so nothing was sent to Claude.',
  rate_limited: 'Too many AI requests right now. Wait a moment and try again.',
  refused: 'Claude declined to answer that.',
  timeout: 'Claude took too long to answer. Try again.',
  upstream_error: 'Claude had an error. Try again in a moment.',
  not_found: 'That conversation no longer exists on the server.',
  ai_error: 'The AI request failed on the server.',
}

export function errorText(code: string | null | undefined, status?: number): string {
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code]
  if (status === 401) return 'Sign in to Aureon to use the AI.'
  if (status === 403) return 'Your account cannot use the AI.'
  if (status === 422) return 'The server could not read that message.'
  if (code) return code.replace(/[^a-z0-9]+/gi, ' ').trim()
  return status ? `The server answered ${status}.` : 'The AI request failed.'
}

export class AureonChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message)
  }
}

/** `{detail: {code, message}}` (FastAPI) or `{detail: "…"}`: the code, when there is one. */
function codeOf(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (detail && typeof detail === 'object' && 'code' in detail) {
    const c = (detail as { code?: unknown }).code
    return typeof c === 'string' ? c : null
  }
  return null
}

// --- the stream --------------------------------------------------------------------------------

export interface ToolEvent {
  name: string
  status: string
}
export interface ApprovalEvent {
  id: string
  action: string
  summary: string
}
export type { Suggestion } from '@/ai/workspace'

export interface DoneEvent {
  conversationId: string
  messageId: number | null
  costUsd: string | null
  steps: number
  stopReason: string | null
  approvals: string[]
  /** The whole answer, sent again with done: shown when no text event arrived. */
  text?: string
}

/** One stream event, read into the app's shape. Exactly one field is set. */
export interface ChatEvent {
  meta?: { conversationId: string; agent: string }
  text?: string
  tool?: ToolEvent
  approval?: ApprovalEvent
  suggestion?: Suggestion
  done?: DoneEvent
  error?: { code: string; message: string }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

/** One SSE frame → a ChatEvent (null for anything else). Exported for the tests. */
export function readEvent(name: string, raw: string): ChatEvent | null {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  switch (name) {
    case 'meta':
      return { meta: { conversationId: str(d.conversation_id), agent: str(d.agent) } }
    case 'text':
      return typeof d.delta === 'string' && d.delta ? { text: d.delta } : null
    case 'tool':
      return { tool: { name: str(d.name), status: str(d.status) } }
    case 'approval':
      return {
        approval: { id: str(d.id), action: str(d.action), summary: str(d.summary) },
      }
    case 'suggestion':
      return isSuggestion(d) ? { suggestion: { kind: d.kind, fields: d.fields } } : null
    case 'done':
      return {
        done: {
          conversationId: str(d.conversation_id),
          messageId: typeof d.message_id === 'number' ? d.message_id : null,
          costUsd: d.cost_usd == null ? null : str(d.cost_usd),
          steps: Number(d.steps) || 0,
          stopReason: d.stop_reason == null ? null : str(d.stop_reason),
          approvals: Array.isArray(d.approvals) ? d.approvals.map(str) : [],
          text: typeof d.text === 'string' ? d.text : '',
        },
      }
    case 'error':
      return { error: { code: str(d.code), message: str(d.message) } }
    default:
      return null
  }
}

/**
 * One turn against POST /api/ai/chat. `chatKey` maps the app's chat to its
 * server conversation: the first turn creates one (meta names it), later turns
 * continue it. A conversation the server no longer has is forgotten, and the
 * turn is sent once more as a new conversation.
 */
export async function* streamChat(opts: {
  message: string
  agent?: AgentPick
  chatKey: string | null
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  /** The user's open items, read-only context for Claude (src/ai/workspace.ts). */
  workspace?: WorkspaceIn
}): AsyncGenerator<ChatEvent> {
  const doFetch = opts.fetchImpl ?? fetch
  const post = (conversationId: string | undefined) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }
    const csrf = readCsrfToken()
    if (csrf) headers['X-CSRF-Token'] = csrf
    const body: components['schemas']['ChatIn'] = {
      message: opts.message.slice(0, MAX_CONTENT),
      ...(conversationId ? { conversation_id: conversationId } : {}),
      ...(opts.agent && opts.agent !== 'auto' ? { agent: opts.agent } : {}),
      ...(opts.workspace ? { workspace: opts.workspace } : {}),
    }
    return doFetch(apiUrl('/api/ai/chat'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  }

  const known = opts.chatKey ? aureonAi.conversations[opts.chatKey] : undefined
  let res = await post(known)
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null)
    const code = codeOf(body)
    if (res.status === 404 && code === 'not_found' && known && opts.chatKey) {
      delete aureonAi.conversations[opts.chatKey]
      res = await post(undefined)
    } else {
      throw new AureonChatError(errorText(code, res.status), res.status, code)
    }
    if (!res.ok || !res.body) {
      const again = await res.json().catch(() => null)
      const c = codeOf(again)
      throw new AureonChatError(errorText(c, res.status), res.status, c)
    }
  }

  for await (const frame of readSse(res)) {
    const ev = readEvent(frame.event, frame.data)
    if (!ev) continue
    if (ev.meta && opts.chatKey && ev.meta.conversationId) {
      aureonAi.conversations[opts.chatKey] = ev.meta.conversationId
    }
    yield ev
    if (ev.done || ev.error) return
  }
}

// --- conversations ------------------------------------------------------------------------------

export type ConversationSummary = components['schemas']['ConversationOut']
export type ConversationDetail = components['schemas']['ConversationDetail']
export type ConversationPage = components['schemas']['Page_ConversationOut_']

export async function listConversations(limit = 50, offset = 0): Promise<ConversationPage> {
  const { data, response } = await aureon.GET('/api/ai/conversations', {
    params: { query: { limit, offset } },
  })
  if (!data) throw new AureonChatError(errorText(null, response.status), response.status)
  return data
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const { data, error, response } = await aureon.GET('/api/ai/conversations/{conversation_id}', {
    params: { path: { conversation_id: id } },
  })
  if (!data) {
    const code = codeOf(error)
    throw new AureonChatError(errorText(code, response.status), response.status, code)
  }
  return data
}

/** "$0.0123" / "$1.20": a turn's cost — four places under a dollar, where turns live. */
export function usd(cost: string | number | null | undefined): string {
  const n = Number(cost)
  if (cost == null || cost === '' || !Number.isFinite(n)) return ''
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}
