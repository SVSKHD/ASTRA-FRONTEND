// The AI tab's proxy (`/api/ai`). It holds the provider keys server-side — the
// browser only ever sends its Supabase session token, verified here exactly as
// `/api/github` does — and re-streams the upstream's SSE as the small envelope
// the client reads: one `data: {"model": "..."}` naming the model that answered,
// `data: {"text": "..."}` per chunk, one `data: {"usage": …}` at the end, and
// `data: {"error": "..."}` if the upstream fails mid-way.
//
// Two providers: Bytez (BYTEZ_API_KEY) and OpenRouter (OPEN_ROUTER_API_KEY).
// The client names the provider and model picked in the AI tab's header; the
// other provider is the fallback (see answerPlan). Both speak OpenAI's
// chat-completions stream, so one reader serves both. A provider that refuses
// the request — not configured, a missing model, a 5xx — hands the turn on.

const BYTEZ_API = 'https://api.bytez.com/models/v2/openai/v1/chat/completions'
// Any chat model in the Bytez catalog; BYTEZ_MODEL overrides it.
const BYTEZ_DEFAULT_MODEL = 'Qwen/Qwen3-4B'

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions'

// Bare ids older builds sent, mapped to OpenRouter slugs.
const MODELS: Record<string, string> = {
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
}
const DEFAULT_MODEL = 'google/gemini-2.5-flash'

const MAX_MESSAGES = 40
const MAX_CHARS = 60_000
const MAX_OUTPUT_TOKENS = 4096

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  /** 'bytez' | 'openrouter', picked in the AI tab's header. */
  provider?: string
  model?: string
  messages?: ChatMessage[]
  system?: string
}

interface SignedInUser {
  id: string
  email: string
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

function csv(value?: string): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') || ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

async function verifySupabaseUser(accessToken: string): Promise<SignedInUser | null> {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  if (!url || !key) throw new Error('Supabase URL and publishable key are not configured.')

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const user = (await response.json()) as { id?: string; email?: string }
  return user.id ? { id: user.id, email: user.email || '' } : null
}

// Same allow-list as the GitHub proxy: the key is the owner's, not every
// signed-up account's.
function isAllowedUser(user: SignedInUser): boolean {
  const uids = csv(process.env.ASTRA_ALLOWED_UIDS || process.env.VITE_ALLOWED_UIDS)
  const emails = csv(process.env.ASTRA_ALLOWED_EMAILS || process.env.VITE_ALLOWED_EMAILS)
  if (!uids.length && !emails.length) return false
  const email = user.email.toLowerCase()
  return uids.includes(user.id.toLowerCase()) || (email.length > 0 && emails.includes(email))
}

/** Trim to the most recent turns that fit, opening on a user turn. */
function toMessages(messages: ChatMessage[]): ChatMessage[] {
  const clean = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .filter((m) => m.content.trim())
    .slice(-MAX_MESSAGES)
  let total = 0
  const kept: ChatMessage[] = []
  for (let i = clean.length - 1; i >= 0; i--) {
    total += clean[i].content.length
    if (total > MAX_CHARS && kept.length) break
    kept.unshift(clean[i])
  }
  // Some upstream models refuse a conversation that opens on an assistant turn.
  while (kept.length && kept[0].role !== 'user') kept.shift()
  return kept.map((m) => ({ role: m.role, content: m.content }))
}

type ProviderId = 'bytez' | 'openrouter'
const PROVIDER_LABEL: Record<ProviderId, string> = { bytez: 'Bytez', openrouter: 'OpenRouter' }
// `owner/name`, as both providers spell model ids. Anything else is not sent on.
const MODEL_ID = /^[A-Za-z0-9][\w.-]*\/[\w.:-]+$/

function providerKey(p: ProviderId): string {
  return p === 'bytez'
    ? process.env.BYTEZ_API_KEY || ''
    : process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY || ''
}

function defaultModel(p: ProviderId): string {
  return p === 'bytez' ? process.env.BYTEZ_MODEL || BYTEZ_DEFAULT_MODEL : DEFAULT_MODEL
}

/**
 * Who should answer, best first: the provider and model the client picked,
 * then (if that model was not the default) the same provider's default, then
 * the other provider's default. Providers without a key are left out. A body
 * from an older build names no provider; its model id decides.
 */
export function answerPlan(
  body: { provider?: unknown; model?: unknown },
  hasKey: (p: ProviderId) => boolean = (p) => !!providerKey(p),
): { provider: ProviderId; model: string }[] {
  const raw = typeof body.model === 'string' ? body.model.trim() : ''
  const legacy = MODELS[raw]
  const first: ProviderId =
    body.provider === 'bytez' || body.provider === 'openrouter'
      ? body.provider
      : legacy
        ? 'openrouter'
        : 'bytez'
  const other: ProviderId = first === 'bytez' ? 'openrouter' : 'bytez'
  const picked =
    first === 'openrouter' && legacy
      ? legacy
      : raw.length <= 120 && MODEL_ID.test(raw)
        ? raw
        : defaultModel(first)

  const out: { provider: ProviderId; model: string }[] = []
  const add = (provider: ProviderId, model: string) => {
    if (!hasKey(provider)) return
    if (out.some((a) => a.provider === provider && a.model === model)) return
    out.push({ provider, model })
  }
  add(first, picked)
  add(first, defaultModel(first))
  add(other, defaultModel(other))
  return out
}

interface Attempt {
  provider: string
  model: string
  call: () => Promise<Response>
}

/** Every way this turn could be answered, best first. */
function attempts(
  body: RequestBody,
  base: { messages: unknown[]; max_tokens: number },
  signal: AbortSignal,
): Attempt[] {
  return answerPlan(body).map(({ provider, model }) => {
    const key = providerKey(provider)
    return {
      provider: PROVIDER_LABEL[provider],
      model,
      call: () =>
        provider === 'bytez'
          ? fetch(BYTEZ_API, {
              method: 'POST',
              // The form bytez.js sends: "Key <key>", not "Bearer".
              headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
              body: JSON.stringify({ ...base, model, stream: true }),
              signal,
            })
          : fetch(OPENROUTER_API, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
                'X-Title': 'Aureon',
              },
              body: JSON.stringify({
                ...base,
                model,
                stream: true,
                stream_options: { include_usage: true },
              }),
              signal,
            }),
    }
  })
}

function upstreamError(provider: string, text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: string | { message?: string } }
    const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message
    if (msg) return `${provider}: ${msg}`
  } catch {
    /* not JSON */
  }
  return `${provider} request failed (${status})`
}

/**
 * Drops `<think>…</think>` blocks (Qwen and other reasoning models write their
 * thinking inline) from a stream that may split a tag across chunks.
 */
export function thinkFilter() {
  const OPEN = '<think>'
  const CLOSE = '</think>'
  let pending = ''
  let thinking = false
  let started = false
  // How much of the end of `s` could be the start of `tag`.
  const partial = (s: string, tag: string) => {
    for (let n = Math.min(tag.length - 1, s.length); n > 0; n--)
      if (tag.startsWith(s.slice(-n))) return n
    return 0
  }
  const emit = (s: string) => {
    // The answer usually follows the thinking after a blank line or two.
    if (!started) s = s.replace(/^\s+/, '')
    if (s) started = true
    return s
  }
  return {
    push(text: string): string {
      pending += text
      let out = ''
      for (;;) {
        if (thinking) {
          const end = pending.indexOf(CLOSE)
          if (end < 0) {
            pending = pending.slice(pending.length - partial(pending, CLOSE))
            return out
          }
          pending = pending.slice(end + CLOSE.length)
          thinking = false
        } else {
          const start = pending.indexOf(OPEN)
          if (start < 0) {
            const keep = partial(pending, OPEN)
            out += emit(pending.slice(0, pending.length - keep))
            pending = pending.slice(pending.length - keep)
            return out
          }
          out += emit(pending.slice(0, start))
          pending = pending.slice(start + OPEN.length)
          thinking = true
        }
      }
    },
    flush(): string {
      const rest = thinking ? '' : emit(pending)
      pending = ''
      return rest
    },
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  if (
    !process.env.BYTEZ_API_KEY &&
    !process.env.OPEN_ROUTER_API_KEY &&
    !process.env.OPENROUTER_API_KEY
  )
    return json({ error: 'No AI key configured: set BYTEZ_API_KEY (or OPEN_ROUTER_API_KEY).' }, 500)

  const accessToken = bearerToken(req)
  if (!accessToken) return json({ error: 'Sign in first.' }, 401)
  let user: SignedInUser | null
  try {
    user = await verifySupabaseUser(accessToken)
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
  if (!user) return json({ error: 'Your session is invalid or expired. Sign in again.' }, 401)
  if (!isAllowedUser(user)) return json({ error: 'This account is not allowed to use AI.' }, 403)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400)
  }
  const messages = toMessages(Array.isArray(body.messages) ? body.messages : [])
  if (!messages.length) return json({ error: 'No message to send.' }, 400)

  const system = body.system?.trim() ? body.system.slice(0, 12_000) : ''
  const base = {
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    // OpenRouter holds credit for the whole cap up front; the model default
    // (64k) is refused outright on a low balance.
    max_tokens: MAX_OUTPUT_TOKENS,
  }

  // First provider that accepts the request answers it.
  let upstream: Response | null = null
  let answered: Attempt | null = null
  let failure = { message: 'No AI provider answered.', status: 502 }
  // Why the first choice did not answer, when a later one did.
  let fallbackReason = ''
  for (const attempt of attempts(body, base, req.signal)) {
    let res: Response
    try {
      res = await attempt.call()
    } catch (error) {
      if (req.signal.aborted) return json({ error: 'Cancelled.' }, 499)
      failure = { message: `${attempt.provider}: ${(error as Error).message}`, status: 502 }
      fallbackReason ||= failure.message
      continue
    }
    if (res.ok && res.body) {
      upstream = res
      answered = attempt
      break
    }
    const text = await res.text().catch(() => '')
    failure = {
      message: upstreamError(attempt.provider, text, res.status),
      status: res.status || 502,
    }
    fallbackReason ||= failure.message
    console.warn(`[ai] ${attempt.provider} ${attempt.model} refused: ${failure.message}`)
  }
  if (!upstream?.body) return json({ error: failure.message }, failure.status)

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = upstream.body.getReader()
  const send = (ctrl: ReadableStreamDefaultController, data: unknown) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  const stream = new ReadableStream({
    async start(ctrl) {
      let buffer = ''
      let usage: { in: number; out: number } | null = null
      const think = thinkFilter()
      // Who is answering, first, so the client can label the reply and the
      // header honestly — including when the default provider was skipped.
      send(ctrl, {
        model: answered?.model,
        provider: answered?.provider,
        ...(fallbackReason ? { fallback: fallbackReason } : {}),
      })
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            // `: OPENROUTER PROCESSING` keep-alives and the closing `[DONE]` carry nothing.
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') continue
            try {
              const evt = JSON.parse(data)
              if (evt?.error) {
                const msg = typeof evt.error === 'string' ? evt.error : evt.error.message
                send(ctrl, { error: msg || 'The model stopped with an error.' })
                continue
              }
              // `delta.reasoning` (the model thinking) is not shown.
              const raw = evt?.choices?.[0]?.delta?.content
              const text = raw ? think.push(raw) : ''
              if (text) send(ctrl, { text })
              const meta = evt?.usage
              if (meta) {
                usage = {
                  in: Number(meta.prompt_tokens || 0),
                  out: Number(meta.completion_tokens || 0),
                }
              }
            } catch {
              /* partial / keep-alive line */
            }
          }
        }
        const tail = think.flush()
        if (tail) send(ctrl, { text: tail })
        if (usage) send(ctrl, { usage })
      } catch (error) {
        send(ctrl, { error: (error as Error).message || 'Stream interrupted.' })
      } finally {
        ctrl.close()
      }
    },
    cancel() {
      void reader.cancel()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  })
}

export const config = {
  path: '/api/ai',
}
