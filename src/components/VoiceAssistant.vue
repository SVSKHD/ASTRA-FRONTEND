<script setup lang="ts">
// The floating mic, on every page (src/voice/assistant.ts has the rules).
//
// Hold to talk (release to send) or tap to start and tap again to stop; the
// browser's recogniser also stops by itself at the end of a phrase. The panel
// shows what was heard, what it was taken to mean, and the reply — which is
// also spoken with the device's voice unless muted. A text box does the same
// without the mic, for browsers with no recogniser (Firefox) and for a refused
// mic. Read-only: the most it ever does is open a screen.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import {
  ERRORS,
  START_FAILED,
  recognitionCtor,
  type Recognition,
} from '@/composables/useSpeechInput'
import { checkSession, isAdmin, tradingSession } from '@/trading/session'
import {
  HTTPS_HELP,
  canSpeak,
  micHelp,
  noteVoice,
  noteVoiceError,
  platform,
  resolveCommand,
  setSpeechMuted,
  speak,
  speechMuted,
  stopSpeaking,
  type VoiceResult,
} from '@/voice/assistant'

const router = useRouter()
const Ctor = recognitionCtor()
const supported = !!Ctor
const secure = typeof window === 'undefined' || window.isSecureContext !== false

type State = 'idle' | 'listening' | 'thinking'
const state = ref<State>('idle')
const open = ref(false)
const heard = ref('')
const result = ref<VoiceResult | null>(null)
const problem = ref('')
const blocked = ref(false)
const typed = ref('')
const muted = ref(speechMuted())
const speaks = canSpeak()
const steps = micHelp(platform())

let rec: Recognition | null = null
let finalText = ''

function start() {
  if (!Ctor || state.value !== 'idle') return
  problem.value = ''
  if (!secure) {
    problem.value = HTTPS_HELP
    blocked.value = true
    open.value = true
    return
  }
  stopSpeaking()
  finalText = ''
  heard.value = ''
  rec = new Ctor()
  rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
  // One phrase: what iOS Safari supports reliably. Interim words show while talking.
  rec.continuous = false
  rec.interimResults = true
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText = `${finalText} ${r[0].transcript}`.trim()
      else interim += r[0].transcript
    }
    heard.value = `${finalText} ${interim}`.trim()
  }
  rec.onerror = (e) => {
    if (e.error === 'aborted') return
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') blocked.value = true
    problem.value = ERRORS[e.error] ?? 'Speech recognition stopped.'
    noteVoiceError(problem.value)
    finalText = ''
  }
  rec.onend = () => {
    rec = null
    if (state.value !== 'listening') return
    state.value = 'idle'
    const text = finalText || heard.value
    if (text) void run(text)
  }
  try {
    rec.start()
    state.value = 'listening'
    open.value = true
  } catch {
    rec = null
    problem.value = START_FAILED
    blocked.value = true
    open.value = true
  }
}

function stop() {
  if (state.value === 'listening') rec?.stop()
}

async function run(text: string) {
  state.value = 'thinking'
  heard.value = text
  open.value = true
  try {
    if (!tradingSession.checked) await checkSession()
    const r = await resolveCommand(text, { admin: !!tradingSession.user && isAdmin() })
    result.value = r
    noteVoice(r)
    speak(r.reply)
    // Not awaited: the reply shows now, while the screen loads.
    if (r.route) void router.push(r.route)
  } catch (e) {
    problem.value = (e as Error).message || 'Voice is unavailable.'
    noteVoiceError(problem.value)
  } finally {
    state.value = 'idle'
  }
}

function submitTyped() {
  const t = typed.value.trim()
  if (!t || state.value === 'thinking') return
  typed.value = ''
  void run(t)
}

// ---- hold to talk / tap to toggle ------------------------------------------

const HOLD_MS = 400
let downAt = 0
let pressStarted = false

function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  if (!supported) {
    open.value = !open.value
    return
  }
  if (state.value === 'listening') {
    pressStarted = false
    stop()
    return
  }
  downAt = Date.now()
  pressStarted = true
  // Started on the press itself: it is the user gesture iOS needs for the mic.
  start()
}
function onUp() {
  if (!pressStarted) return
  pressStarted = false
  // Held: release sends. A quick tap leaves it listening until the next tap
  // (or the end of the phrase).
  if (Date.now() - downAt >= HOLD_MS) stop()
}
function onKey() {
  if (!supported) {
    open.value = !open.value
    return
  }
  if (state.value === 'listening') stop()
  else start()
}

async function openText() {
  open.value = true
  await nextTick()
  globalThis.document?.getElementById('voice-text')?.focus()
}

function toggleMute() {
  muted.value = !muted.value
  setSpeechMuted(muted.value)
  if (muted.value) stopSpeaking()
}

onBeforeUnmount(() => {
  rec?.abort()
  stopSpeaking()
})

const label = computed(() =>
  !supported
    ? 'Voice commands (type)'
    : state.value === 'listening'
      ? 'Listening — release or tap to send'
      : 'Voice: hold to talk, or tap to start',
)
const SOURCE: Record<string, string> = {
  app: 'this app',
  grammar: 'Aureon',
  ollama: 'Aureon (local model)',
  none: '—',
}
</script>

<template>
  <div class="va" :class="{ 'is-open': open }">
    <section
      v-if="open"
      class="va__panel"
      role="dialog"
      aria-label="Voice commands"
      aria-live="polite"
    >
      <header class="va__head">
        <strong>Voice</strong>
        <span class="va__tag">read-only · opens screens</span>
        <Button size="sm" variant="ghost" aria-label="Close voice panel" @click="open = false"
          >Close</Button
        >
      </header>

      <p v-if="state === 'listening'" class="va__status">Listening… {{ heard }}</p>
      <p v-else-if="state === 'thinking'" class="va__status">Working out “{{ heard }}”…</p>

      <dl v-if="result && state === 'idle'" class="va__result" data-testid="voice-result">
        <dt>Heard</dt>
        <dd>“{{ result.transcript }}”</dd>
        <dt>Intent</dt>
        <dd>
          <code>{{ result.intent }}</code> · {{ SOURCE[result.source] }}
        </dd>
        <dt>Reply</dt>
        <dd>
          {{ result.reply }}
          <span v-if="result.readOnly" class="va__ro">Open it in Spasta to act.</span>
        </dd>
      </dl>

      <div v-if="problem" class="va__problem" role="alert">
        <p>{{ problem }}</p>
        <ol v-if="blocked && secure" class="va__steps">
          <li v-for="s in steps" :key="s">{{ s }}</li>
        </ol>
        <p v-if="blocked">You can type the command below instead.</p>
      </div>
      <p v-if="!supported" class="va__note">
        This browser has no speech recognition (Firefox, some in-app browsers). Type a command.
      </p>

      <form class="va__form" @submit.prevent="submitTyped">
        <TextInput
          id="voice-text"
          v-model="typed"
          size="sm"
          placeholder="Or type: open news, show images, open PR 42"
          aria-label="Type a voice command"
        />
        <Button type="submit" size="sm" variant="primary" :disabled="!typed.trim()">Go</Button>
      </form>
      <div class="va__foot">
        <Button
          v-if="speaks && result"
          size="sm"
          variant="ghost"
          :disabled="muted"
          @click="speak(result.reply)"
          >Say it again</Button
        >
        <Button v-if="speaks" size="sm" variant="ghost" :aria-pressed="muted" @click="toggleMute">{{
          muted ? 'Unmute replies' : 'Mute replies'
        }}</Button>
        <Button v-if="supported" size="sm" variant="ghost" @click="openText">Type instead</Button>
      </div>
    </section>

    <button
      type="button"
      class="va__mic"
      :class="[`is-${state}`, { 'is-unsupported': !supported }]"
      :aria-label="label"
      :aria-pressed="state === 'listening'"
      data-testid="voice-mic"
      @pointerdown="onDown"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onUp"
      @keydown.enter.prevent="onKey"
      @keydown.space.prevent="onKey"
      @contextmenu.prevent
    >
      <Icon :name="supported ? 'mic' : 'keyboard'" size="md" />
    </button>
  </div>
</template>

<style scoped>
.va {
  position: fixed;
  right: var(--sp-4);
  bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  z-index: 65;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-2);
  pointer-events: none;
}
.va > * {
  pointer-events: auto;
}
.va__mic {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: 50%;
  background: var(--glass-raised, var(--glass-card));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text-primary, var(--theme-text));
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  transition:
    transform 120ms var(--ease-out),
    background 120ms var(--ease-out);
}
.va__mic:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 3px;
}
.va__mic.is-listening {
  background: var(--theme-accent);
  color: var(--theme-on-accent, #fff);
  transform: scale(1.08);
  animation: va-pulse 1.2s ease-in-out infinite;
}
.va__mic.is-thinking {
  opacity: 0.7;
}
@keyframes va-pulse {
  50% {
    box-shadow: 0 0 0 10px color-mix(in oklch, var(--theme-accent) 25%, transparent);
  }
}
.va__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: min(360px, calc(100vw - 32px));
  max-height: min(70vh, 520px);
  overflow-y: auto;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border, var(--theme-border));
  border-radius: var(--radius-sheet, 20px);
  background: var(--glass-raised, var(--glass-card));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.35);
  color: var(--text-primary, var(--theme-text));
}
.va__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.va__head strong {
  font-size: var(--text-sm);
}
.va__tag {
  flex: 1;
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--text-secondary, var(--theme-dim));
}
.va__status,
.va__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
  overflow-wrap: anywhere;
}
.va__result {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px var(--sp-2);
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}
.va__result dt {
  color: var(--text-secondary, var(--theme-dim));
}
.va__result dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.va__ro {
  display: block;
  margin-top: 2px;
  font-weight: var(--weight-semibold);
  color: var(--theme-warning, var(--theme-accent));
}
.va__problem {
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-primary, var(--theme-text));
}
.va__problem p {
  margin: 0 0 4px;
}
.va__steps {
  margin: 0 0 4px;
  padding-left: 1.2em;
  color: var(--text-secondary, var(--theme-dim));
}
.va__form {
  display: flex;
  gap: var(--sp-2);
  min-width: 0;
}
.va__form > :first-child {
  flex: 1;
  min-width: 0;
}
.va__foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}
@media (prefers-reduced-motion: reduce) {
  .va__mic {
    transition: none;
  }
  .va__mic.is-listening {
    animation: none;
    transform: none;
  }
}
</style>
