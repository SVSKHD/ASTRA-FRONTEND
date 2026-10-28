// Dictation through the browser's own speech recognition (Web Speech API) —
// no audio leaves through the app and no key is needed; Chrome, Edge and
// Safari send it to their own recogniser. Firefox has none, so `supported` is
// false there and the mic is not offered.
//
// While listening, the words appear as they are heard: `text` is what was
// there before the mic started, plus everything said since (final words, then
// the still-changing guess). Stopping keeps it; nothing is sent by itself.

import { onBeforeUnmount, ref } from 'vue'

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked — allow it in the browser’s site settings.',
  'service-not-allowed': 'Microphone access is blocked — allow it in the browser’s site settings.',
  'no-speech': 'Didn’t hear anything — try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs a connection.',
}

export function useSpeechInput(opts: {
  /** The field's current text, read when the mic starts. */
  current: () => string
  /** Called with the field's new text as words come in. */
  onText: (text: string) => void
  onError?: (message: string) => void
}) {
  const Ctor = recognitionCtor()
  const supported = !!Ctor
  const listening = ref(false)
  let rec: Recognition | null = null
  let before = ''
  let heard = ''

  function join(...parts: string[]) {
    return parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join(' ')
  }

  function start() {
    if (!Ctor || listening.value) return
    rec = new Ctor()
    rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    before = opts.current()
    heard = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) heard = join(heard, r[0].transcript)
        else interim = join(interim, r[0].transcript)
      }
      opts.onText(join(before, heard, interim))
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted') opts.onError?.(ERRORS[e.error] ?? 'Speech recognition stopped.')
    }
    rec.onend = () => {
      listening.value = false
      rec = null
    }
    try {
      rec.start()
      listening.value = true
    } catch {
      rec = null
    }
  }

  function stop() {
    rec?.stop()
  }

  function toggle() {
    if (listening.value) stop()
    else start()
  }

  onBeforeUnmount(() => rec?.abort())
  return { supported, listening, start, stop, toggle }
}
