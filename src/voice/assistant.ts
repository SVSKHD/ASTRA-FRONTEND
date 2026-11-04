// The global voice assistant's brain: a transcript in, a reply and (at most) a
// screen to open out. Read-only by construction — nothing here calls anything
// but POST /api/v1/voice/intent, which itself only ever answers with a route.
//
// Three sources, in order:
//   1. Anything that would ACT (approve, merge, buy, sell, close, delete…) is
//      never done by voice. The reply says "open it in Spasta" and the screen
//      where it is done is opened — the approval request itself when the server
//      can name it ("approve request 12" → /dev/approvals/12).
//   2. The app's own screens ("open news", "show images", "go to MT5"), matched
//      here, so they work for every signed-in user and offline.
//   3. The server's grammar (admin only): approvals, a PR, repairs, agents.
//
// There is no server speech endpoint (no /voice/command or /voice/speak):
// recognition is the browser's (Web Speech API) and the reply is spoken with
// the browser's speechSynthesis. Aureon only ever sees the transcript.

import { reactive } from 'vue'
import { aureon, errorMessage } from '@/api/client'
import { safeVoiceRoute } from '@/control/voice'

/** What voice did in this browser, for the agents page (there is no server-side voice agent). */
export const voiceActivity = reactive({
  commands: 0,
  lastAt: 0,
  lastIntent: '',
  lastSource: '' as VoiceSource | '',
  lastError: '',
  lastErrorAt: 0,
})

export function noteVoice(r: VoiceResult): void {
  voiceActivity.commands++
  voiceActivity.lastAt = Date.now()
  voiceActivity.lastIntent = r.intent
  voiceActivity.lastSource = r.source
  if (r.intent === 'unavailable') noteVoiceError(r.reply)
}
export function noteVoiceError(message: string): void {
  voiceActivity.lastError = message
  voiceActivity.lastErrorAt = Date.now()
}

export type VoiceSource = 'app' | 'grammar' | 'ollama' | 'none'

export interface VoiceResult {
  transcript: string
  /** What was understood, e.g. "open_news", "open_approval", "needs_approval", "unknown". */
  intent: string
  route: string | null
  reply: string
  source: VoiceSource
  /** The request would act; it was turned into navigation. */
  readOnly: boolean
}

/** The app's screens voice may open, by the words that name them. */
const SCREENS: { intent: string; route: string; label: string; words: RegExp }[] = [
  { intent: 'open_news', route: '/news', label: 'News', words: /\b(news|headlines?)\b/ },
  {
    intent: 'open_images',
    route: '/images',
    label: 'Images',
    words: /\b(images?|pictures?|gallery|image studio)\b/,
  },
  {
    intent: 'open_mt5',
    route: '/trading/mt5',
    label: 'the MT5 bot',
    words: /\b(mt ?5|meta ?trader|gold bot|bot)\b/,
  },
  { intent: 'open_dhan', route: '/trading/dhan', label: 'Dhan', words: /\b(dhan|dan|holdings?)\b/ },
  { intent: 'open_paper', route: '/trading/paper', label: 'paper trading', words: /\bpaper\b/ },
  {
    intent: 'open_trading',
    route: '/trading',
    label: 'Trading',
    words: /\b(trading|markets?|positions?|portfolio)\b/,
  },
  { intent: 'open_settings', route: '/settings', label: 'Settings', words: /\bsettings?\b/ },
  {
    intent: 'open_control_center',
    route: '/dev',
    label: 'the control center',
    words: /\b(control cent(er|re)|dev ?panel|github)\b/,
  },
  {
    intent: 'open_expenses',
    route: '/expenses',
    label: 'Expenses',
    words: /\b(expenses?|spending)\b/,
  },
  {
    intent: 'open_trades',
    route: '/trades',
    label: 'the trade log',
    words: /\b(trades|trade log|journal)\b/,
  },
  {
    intent: 'open_todos',
    route: '/?tab=todo',
    label: 'Todos',
    words: /\b(todos?|to-?dos?|to do list)\b/,
  },
  {
    intent: 'open_calendar',
    route: '/?tab=calendar',
    label: 'the calendar',
    words: /\b(calendar|schedule)\b/,
  },
  { intent: 'open_ai', route: '/?tab=ai', label: 'the AI chat', words: /\b(ai|assistant|chat)\b/ },
  {
    intent: 'open_home',
    route: '/?tab=overview',
    label: 'Overview',
    words: /\b(home|overview|dashboard)\b/,
  },
]

/** Words that ask for something to be DONE. Voice never does it. */
// "open approval 12" and "show my orders" are navigation; "approve 12" and
// "place an order" are not.
const ACTION =
  /\b(approve|deny|reject|merge|execute|deploy|dispatch|buy|sell|short|place|close|cancel|delete|remove|push|transfer|pay|withdraw)\b/
const TRADE = /\b(buy|sell|short|place|order|close|position)\b/

function normal(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The app screen a transcript names, if any. */
export function screenFor(transcript: string): (typeof SCREENS)[number] | null {
  const t = normal(transcript)
  return SCREENS.find((s) => s.words.test(t)) ?? null
}

export function wouldAct(transcript: string): boolean {
  return ACTION.test(normal(transcript))
}

/** Every route this file may hand to the router: the screens above, or the server's five. */
export function safeRoute(route: unknown): string | null {
  if (typeof route !== 'string') return null
  if (SCREENS.some((s) => s.route === route) || route === '/dev/inbox') return route
  return safeVoiceRoute(route)
}

export interface ServerIntent {
  intent: string
  route: string | null
  source: 'grammar' | 'ollama' | 'none'
  note: string | null
}

/** POST /api/v1/voice/intent. null = not available to this user (or unreachable). */
export async function askServer(transcript: string): Promise<ServerIntent | { error: string }> {
  try {
    const { data, error, response } = await aureon.POST('/api/v1/voice/intent', {
      body: { transcript },
    })
    if (data) return data
    if (response.status === 401 || response.status === 403) {
      return { error: 'Approvals and PRs by voice need an admin Aureon session.' }
    }
    return { error: errorMessage(error, `Aureon answered ${response.status}.`) }
  } catch {
    return { error: 'Aureon is unreachable.' }
  }
}

const EXAMPLES = '“open news”, “show images”, “go to MT5”, “open approvals” or “open PR 42”'

export async function resolveCommand(
  raw: string,
  opts: { admin: boolean; ask?: typeof askServer } = { admin: false },
): Promise<VoiceResult> {
  const transcript = raw.trim().slice(0, 500)
  const ask = opts.ask ?? askServer
  const base = { transcript, readOnly: false }
  if (!transcript) {
    return {
      ...base,
      intent: 'empty',
      route: null,
      reply: 'I didn’t hear anything. Try again.',
      source: 'none',
    }
  }

  // 1. Requests to act become navigation, with the reason said out loud.
  if (wouldAct(transcript)) {
    let route: string | null = null
    let source: VoiceSource = 'app'
    if (opts.admin) {
      const s = await ask(transcript)
      if (!('error' in s)) {
        route = safeRoute(s.route)
        if (route) source = s.source
      }
    }
    if (!route) route = TRADE.test(normal(transcript)) ? '/trading' : '/dev/inbox'
    return {
      ...base,
      readOnly: true,
      intent: 'needs_approval',
      route,
      source,
      reply: 'Voice is read-only. That needs your approval, so open it in Spasta. Opening it now.',
    }
  }

  // 2. The app's own screens.
  const screen = screenFor(transcript)
  if (screen) {
    return {
      ...base,
      intent: screen.intent,
      route: screen.route,
      source: 'app',
      reply: `Opening ${screen.label}.`,
    }
  }

  // 3. The server's grammar: approvals, a PR, repairs, agents.
  if (opts.admin) {
    const s = await ask(transcript)
    if ('error' in s) {
      return { ...base, intent: 'unavailable', route: null, source: 'none', reply: s.error }
    }
    const route = safeRoute(s.route)
    if (route) {
      return {
        ...base,
        intent: s.intent,
        route,
        source: s.source,
        reply: s.note ? `Opening it. ${s.note}.` : 'Opening it.',
      }
    }
  }
  return {
    ...base,
    intent: 'unknown',
    route: null,
    source: 'none',
    reply: `I didn’t catch a screen in that. Try ${EXAMPLES}.`,
  }
}

// ---- speaking the reply ------------------------------------------------------

const MUTE_KEY = 'voice.muted'

export function speechMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}
export function setSpeechMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1')
    else localStorage.removeItem(MUTE_KEY)
  } catch {
    /* private window: the choice lasts for this visit */
  }
}

export function canSpeak(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

/** Say the reply with the device's own voice. No network, so CSP is untouched. */
export function speak(text: string): void {
  if (!canSpeak() || speechMuted() || !text) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = navigator.language || 'en-US'
    window.speechSynthesis.speak(u)
  } catch {
    /* a missing voice is not worth an error */
  }
}
export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel()
}

// ---- when the mic is refused ------------------------------------------------

export type Platform = 'ios' | 'android' | 'other'

export function platform(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): Platform {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

/** Step-by-step help for turning the microphone back on, per platform. */
export function micHelp(p: Platform): string[] {
  if (p === 'ios') {
    return [
      'In Safari, tap “aA” (or the page-settings icon) in the address bar → Website Settings → Microphone → Allow.',
      'Settings → Privacy & Security → Speech Recognition: make sure Safari is allowed.',
      'Settings → Safari → Microphone: set to Ask or Allow.',
      'If the Home Screen app still cannot listen, open the site in Safari itself — older iOS versions do not give installed web apps speech recognition.',
    ]
  }
  if (p === 'android') {
    return [
      'In Chrome, tap the icon left of the address (tune or lock) → Permissions → Microphone → Allow.',
      'Or Chrome ⋮ → Settings → Site settings → Microphone, and remove this site from “Blocked”.',
      'Android Settings → Apps → Chrome → Permissions → Microphone: Allow.',
      'Speech recognition uses the Google app: keep it installed and enabled.',
    ]
  }
  return [
    'Click the icon left of the address → Site settings → Microphone → Allow, then try again.',
    'Firefox has no speech recognition: type the command instead.',
  ]
}

/** The address has to be HTTPS for any browser to open the mic. */
export const HTTPS_HELP =
  'The microphone only works over HTTPS. Open Spasta at its https:// address — over Tailscale, the https://<machine>.<tailnet>.ts.net name, not the 100.x IP.'
