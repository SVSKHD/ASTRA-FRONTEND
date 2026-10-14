// The AI tab's proxy (`/api/ai`). It holds the Gemini key server-side — the
// browser only ever sends its Supabase session token, verified here exactly as
// `/api/github` does — and re-streams Gemini's SSE as the small envelope the
// client reads: `data: {"text": "..."}` per chunk, one `data: {"usage": …}`
// at the end, `data: {"error": "..."}` if the upstream fails mid-way.

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models'

// Only these reach Google. Anything else (an old chat still carrying a Claude
// id) is answered by the default rather than refused.
const MODELS = new Set(['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'])
const DEFAULT_MODEL = 'gemini-2.5-flash'

const MAX_MESSAGES = 40
const MAX_CHARS = 60_000

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
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

/** Trim to the most recent turns that fit, and map to Gemini's shape. */
function toContents(messages: ChatMessage[]) {
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
  // Gemini wants the conversation to open on a user turn.
  while (kept.length && kept[0].role !== 'user') kept.shift()
  return kept.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

async function callGemini(model: string, payload: unknown, key: string, signal: AbortSignal) {
  return fetch(`${GEMINI_API}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(payload),
    signal,
  })
}

function upstreamError(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } }
    if (parsed.error?.message) return parsed.error.message
  } catch {
    /* not JSON */
  }
  return `Gemini request failed (${status})`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const key = process.env.GEMINI_API_KEY
  if (!key) return json({ error: 'GEMINI_API_KEY is not configured.' }, 500)

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
  const contents = toContents(Array.isArray(body.messages) ? body.messages : [])
  if (!contents.length) return json({ error: 'No message to send.' }, 400)

  const model = MODELS.has(String(body.model)) ? String(body.model) : DEFAULT_MODEL
  const payload = {
    contents,
    ...(body.system?.trim()
      ? { systemInstruction: { parts: [{ text: body.system.slice(0, 12_000) }] } }
      : {}),
  }

  // A busy model (503/429) falls back once to the default rather than failing
  // the turn outright.
  let upstream = await callGemini(model, payload, key, req.signal)
  if ((upstream.status === 503 || upstream.status === 429) && model !== DEFAULT_MODEL) {
    upstream = await callGemini(DEFAULT_MODEL, payload, key, req.signal)
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    return json({ error: upstreamError(text, upstream.status) }, upstream.status || 502)
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = upstream.body.getReader()
  const send = (ctrl: ReadableStreamDefaultController, data: unknown) =>
    ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  const stream = new ReadableStream({
    async start(ctrl) {
      let buffer = ''
      let usage: { in: number; out: number } | null = null
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            try {
              const evt = JSON.parse(trimmed.slice(5).trim())
              const parts = evt?.candidates?.[0]?.content?.parts ?? []
              const text = parts
                .filter((p: { thought?: boolean }) => !p.thought)
                .map((p: { text?: string }) => p.text ?? '')
                .join('')
              if (text) send(ctrl, { text })
              const meta = evt?.usageMetadata
              if (meta) {
                usage = {
                  in: Number(meta.promptTokenCount || 0),
                  out:
                    Number(meta.candidatesTokenCount || 0) + Number(meta.thoughtsTokenCount || 0),
                }
              }
            } catch {
              /* partial / keep-alive line */
            }
          }
        }
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
