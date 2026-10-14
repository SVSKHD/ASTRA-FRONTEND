<script setup lang="ts">
// The AI reply, followed from another tab. Ask something, leave the AI tab, and
// this card keeps the reply's progress in the corner — the tail of the text as
// it streams — then pops when the reply lands. Open goes back to that chat; the
// AI tab dismisses it once the finished reply is on screen there.
//
// It reads the same module-level run AiView does (useAiChat), so nothing here
// depends on the AI tab being mounted.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useUiStore } from '@/stores/ui'
import { useAiChat } from '@/composables/useAiChat'
import Button from '@/components/ui/Button.vue'

const app = useAppStore()
const ui = useUiStore()
const { tab } = storeToRefs(ui)
const { run, stop, dismiss } = useAiChat()

const chat = computed(() => (run.value ? app.aiChatById(run.value.chatId) : undefined))
const reply = computed(
  () => chat.value?.messages.find((m) => m.id === run.value?.msgId)?.content ?? '',
)
const visible = computed(() => !!run.value && !!chat.value && tab.value !== 'ai')
const status = computed(() => run.value?.status ?? 'streaming')

// The streaming card shows the newest words; the finished one, the opening.
const preview = computed(() => {
  const t = reply.value.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (status.value === 'streaming') return t.length > 140 ? '…' + t.slice(-140) : t
  return t.length > 220 ? t.slice(0, 220) + '…' : t
})

const heading = computed(() => {
  if (status.value === 'streaming') return reply.value ? 'Writing…' : 'Thinking…'
  return status.value === 'error' ? 'Reply failed' : 'Reply ready'
})

function open() {
  if (!run.value) return
  app.selectAiChat(run.value.chatId)
  ui.setTab('ai')
}
</script>

<template>
  <Transition name="ai-dock">
    <div
      v-if="visible"
      class="ai-dock"
      :class="{ 'ai-dock--done': status !== 'streaming', 'ai-dock--error': status === 'error' }"
      role="status"
      aria-live="polite"
    >
      <div class="ai-dock__head">
        <span class="ai-dock__orb" :class="{ 'ai-dock__orb--live': status === 'streaming' }" />
        <span class="ai-dock__heading">{{ heading }}</span>
        <span class="ai-dock__title">{{ chat?.title }}</span>
        <button
          v-if="status !== 'streaming'"
          class="ai-dock__x"
          type="button"
          aria-label="Dismiss"
          @click="dismiss()"
        >
          ×
        </button>
      </div>
      <button type="button" class="ai-dock__body" @click="open">
        <template v-if="preview">{{ preview }}</template>
        <span v-else class="ai-dock__dots"><i /><i /><i /></span>
        <span v-if="status === 'streaming' && preview" class="ai-dock__cursor" />
      </button>
      <div class="ai-dock__actions">
        <Button v-if="status === 'streaming'" variant="ghost" size="sm" @click="stop()">
          Stop
        </Button>
        <Button variant="tinted" size="sm" @click="open">Open chat</Button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ai-dock {
  position: fixed;
  right: var(--sp-5);
  bottom: calc(var(--sp-6) * 2 + var(--sp-4));
  z-index: 61;
  width: min(340px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-dialog);
  border: 1px solid var(--layer-overlay-border, var(--glass-border));
  background: var(--surface-overlay, var(--glass-solid));
  box-shadow: var(--layer-overlay-shadow, var(--elev-1));
  color: var(--theme-text);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.ai-dock--done {
  border-color: var(--theme-accent);
  animation: ai-dock-pop var(--dur-pop, 0.4s) var(--ease-spring, ease-out);
}
.ai-dock--error {
  border-color: var(--theme-danger, var(--theme-text));
}
.ai-dock__head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.ai-dock__orb {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--theme-accent);
}
.ai-dock__orb--live {
  animation: ai-dock-pulse 1.2s ease-in-out infinite;
}
.ai-dock__heading {
  flex-shrink: 0;
  font-weight: var(--weight-semibold);
}
.ai-dock__title {
  flex: 1;
  min-width: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-dock__x {
  border: none;
  background: transparent;
  color: var(--theme-dim);
  cursor: pointer;
  font-size: var(--text-md);
  line-height: 1;
  padding: 0 2px;
}
.ai-dock__x:hover {
  color: var(--theme-text);
}
.ai-dock__body {
  display: block;
  width: 100%;
  max-height: 6.5em;
  overflow: hidden;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  word-break: break-word;
}
.ai-dock__cursor {
  display: inline-block;
  width: 6px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: currentColor;
  animation: ai-dock-blink 1s steps(2) infinite;
}
.ai-dock__dots {
  display: inline-flex;
  gap: 4px;
}
.ai-dock__dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-dim);
  animation: ai-dock-pulse 1.2s ease-in-out infinite;
}
.ai-dock__dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.ai-dock__dots i:nth-child(3) {
  animation-delay: 0.3s;
}
.ai-dock__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}

@keyframes ai-dock-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes ai-dock-blink {
  50% {
    opacity: 0;
  }
}
@keyframes ai-dock-pop {
  0% {
    transform: scale(0.92) translateY(8px);
  }
  60% {
    transform: scale(1.03) translateY(-2px);
  }
  100% {
    transform: none;
  }
}

.ai-dock-enter-active {
  transition:
    opacity 0.25s ease,
    transform var(--dur-pop, 0.4s) var(--ease-spring, ease-out);
}
.ai-dock-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.2s ease-in;
}
.ai-dock-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.96);
}
.ai-dock-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@media (max-width: 600px) {
  .ai-dock {
    right: 16px;
    left: 16px;
    width: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-dock--done,
  .ai-dock__orb--live,
  .ai-dock__dots i,
  .ai-dock__cursor {
    animation: none;
  }
  .ai-dock-enter-active,
  .ai-dock-leave-active {
    transition: opacity 0.15s ease;
  }
  .ai-dock-enter-from,
  .ai-dock-leave-to {
    transform: none;
  }
}
</style>
