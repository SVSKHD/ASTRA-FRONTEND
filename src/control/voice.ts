// Voice navigation for the control center (backend docs/23-approval-engine.md).
//
// One tap = one utterance. The browser's own recogniser (Web Speech API) turns
// it into text — on Android Chrome that audio goes to Google, on iPhone Safari
// to Apple (or on-device); Aureon only ever sees the transcript. The transcript
// goes to POST /api/v1/voice/intent, which answers with a route and never acts.
//
// Navigation only, twice over: the server can return one of five screens, and
// this file re-checks the route against the same five patterns before
// router.push. It calls no other endpoint, so nothing said here can approve,
// merge, trade or write anything — "approve request 5" opens request 5.

import { onBeforeUnmount, ref } from 'vue'
import { aureon, errorMessage } from '@/api/client'
import {
  ERRORS,
  START_FAILED,
  recognitionCtor,
  type Recognition,
} from '@/composables/useSpeechInput'

/** The only places voice may take you (the backend's five intents). */
const SAFE_ROUTES = [
  /^\/dev\/approvals$/,
  /^\/dev\/approvals\/[0-9a-f]{1,8}(?:-[0-9a-f]{1,12}){0,4}$/,
  /^\/dev\/approvals\/\d{1,12}$/,
  /^\/dev\/repairs$/,
  /^\/dev\/prs\/\d{1,7}$/,
  /^\/dev\/agents$/,
]

export function safeVoiceRoute(route: unknown): string | null {
  return typeof route === 'string' && SAFE_ROUTES.some((r) => r.test(route)) ? route : null
}

export interface VoiceAnswer {
  route: string | null
  message: string
}

/** Transcript -> a navigation route (or why not). Never anything else. */
export async function resolveVoice(transcript: string): Promise<VoiceAnswer> {
  const words = transcript.trim().slice(0, 500)
  if (!words) return { route: null, message: 'Didn’t hear anything — try again.' }
  const { data, error } = await aureon.POST('/api/v1/voice/intent', {
    body: { transcript: words },
  })
  if (error || !data) return { route: null, message: errorMessage(error, 'Voice is unavailable.') }
  const route = safeVoiceRoute(data.route)
  if (!route) {
    return {
      route: null,
      message: `“${words}” — try “open approvals”, “open PR 42”, “show agents” or “open repairs”.`,
    }
  }
  return { route, message: data.note ? `Opening ${route} (${data.note})` : `Opening ${route}` }
}

export type VoiceState = 'idle' | 'listening' | 'resolving'

/**
 * The mic button's logic. `go` is router.push; `say` shows a short status.
 * start() must run from a tap: iOS Safari only opens the mic on a user gesture.
 */
export function useVoiceNav(opts: { go: (route: string) => unknown; say: (msg: string) => void }) {
  const Ctor = recognitionCtor()
  const supported = !!Ctor
  const state = ref<VoiceState>('idle')
  let rec: Recognition | null = null
  let heard = ''

  async function finish() {
    rec = null
    if (state.value !== 'listening') return
    if (!heard) {
      state.value = 'idle'
      return
    }
    state.value = 'resolving'
    try {
      const answer = await resolveVoice(heard)
      opts.say(answer.message)
      if (answer.route) await opts.go(answer.route)
    } catch {
      opts.say('Voice is unavailable.')
    } finally {
      state.value = 'idle'
    }
  }

  function start() {
    if (!Ctor || state.value !== 'idle') return
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      opts.say(START_FAILED)
      return
    }
    heard = ''
    rec = new Ctor()
    rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
    // One phrase, final results only: what iOS Safari supports reliably.
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) heard = `${heard} ${r[0].transcript}`.trim()
      }
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted') opts.say(ERRORS[e.error] ?? 'Speech recognition stopped.')
      heard = ''
    }
    rec.onend = () => void finish()
    try {
      rec.start()
      state.value = 'listening'
    } catch {
      rec = null
      opts.say(START_FAILED)
    }
  }

  function toggle() {
    if (state.value === 'listening') rec?.stop()
    else start()
  }

  onBeforeUnmount(() => {
    state.value = 'idle'
    rec?.abort()
  })
  return { supported, state, start, toggle }
}
