// Which AI provider and model this device talks to — picked in the AI tab's
// header, remembered per device, and read by everything that calls `/api/ai`:
// the chat, as-you-type autocorrect and the typo sweep.
//
// Each provider keeps its own model choice, so switching Bytez → OpenRouter →
// Bytez comes back to the Bytez model you had.

import { reactive, watch } from 'vue'
import { AI_PROVIDERS, isImageModel, type AiProvider } from '@/types'

const KEY = 'aureon.ai.settings'

interface AiSettings {
  provider: AiProvider
  models: Record<AiProvider, string>
}

/** What a model id may look like: `owner/name`, as both providers spell them. */
export const MODEL_ID = /^[A-Za-z0-9][\w.-]*\/[\w.:-]+$/

function defaults(): AiSettings {
  return {
    provider: 'bytez',
    models: {
      bytez: AI_PROVIDERS.bytez.defaultModel,
      openrouter: AI_PROVIDERS.openrouter.defaultModel,
    },
  }
}

function load(): AiSettings {
  const base = defaults()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<AiSettings> | null
    if (!raw) return base
    if (raw.provider === 'bytez' || raw.provider === 'openrouter') base.provider = raw.provider
    for (const p of ['bytez', 'openrouter'] as const) {
      const m = raw.models?.[p]
      if (typeof m === 'string' && MODEL_ID.test(m) && !isImageModel(m)) base.models[p] = m
    }
  } catch {
    /* private window or a corrupt value — start from the defaults */
  }
  return base
}

export const aiSettings = reactive<AiSettings>(load())

watch(
  aiSettings,
  (s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* private window — the choice still holds for this visit */
    }
  },
  { deep: true },
)

export function setAiProvider(p: AiProvider) {
  aiSettings.provider = p
}

/** Sets the chat model. Refuses (returns false) a malformed id or an image model. */
export function setAiModel(id: string): boolean {
  const v = id.trim()
  if (!MODEL_ID.test(v) || isImageModel(v)) return false
  aiSettings.models[aiSettings.provider] = v
  return true
}

/** The chat's provider and model. */
export function chatTarget(): { provider: AiProvider; model: string } {
  return { provider: aiSettings.provider, model: aiSettings.models[aiSettings.provider] }
}

/**
 * Autocorrect and the typo sweep: the same provider, but on OpenRouter the
 * cheapest model — proofreading every pause in typing on Claude Opus would be
 * a waste. Bytez has no per-token price, so it keeps the chosen model.
 */
export function proofreadTarget(): { provider: AiProvider; model: string } {
  const provider = aiSettings.provider
  return {
    provider,
    model: provider === 'openrouter' ? AI_PROVIDERS.openrouter.cheapModel : aiSettings.models.bytez,
  }
}
