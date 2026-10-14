<script setup lang="ts">
import { ref } from 'vue'
import Accordion from '@/components/ui/Accordion.vue'
import Icon from '@/components/ui/Icon.vue'
import { EDITOR_TOOLS, NOTE_TOOL_ICONS } from '@/utils/noteTools'
import type { EditorAction } from '@/composables/useMarkdownEditor'
const open = ref(false)
const syntax: Record<EditorAction, string> = {
  bold: '**text**',
  italic: '*text*',
  strike: '~~text~~',
  code: '`code`',
  link: '[text](https://example.com)',
  h1: '# Heading',
  h2: '## Heading',
  h3: '### Heading',
  bullet: '- Item',
  checklist: '- [ ] Item',
  ordered: '1. Item',
  quote: '> Quote',
  fence: '```language\ncode\n```',
  table: '| A | B |\n| --- | --- |\n| 1 | 2 |',
}
</script>
<template>
  <Accordion class="note-commands" title="Formatting commands" :open="open" @toggle="open = $event">
    <p class="note-commands__hint">
      Use the toolbar or type Markdown. On Mac, use Command instead of Ctrl.
    </p>
    <div class="note-commands__save">
      <Icon name="corner-down-left" size="sm" /><span>Save your rules or note</span
      ><kbd>Ctrl / Command + Enter</kbd>
    </div>
    <ul class="note-commands__grid">
      <li
        v-for="(tool, index) in EDITOR_TOOLS"
        :key="tool.action"
        :style="{ '--command-delay': Math.min(index, 8) * 18 + 'ms' }"
      >
        <div class="note-commands__heading">
          <span class="note-commands__icon"
            ><Icon :name="NOTE_TOOL_ICONS[tool.action]" size="sm" /></span
          ><span>{{ tool.title.split(' (')[0] }}</span
          ><kbd v-if="tool.title.includes(' (')">{{ tool.title.split(' (')[1].slice(0, -1) }}</kbd>
        </div>
        <code>{{ syntax[tool.action] }}</code>
      </li>
    </ul>
  </Accordion>
</template>
<style scoped>
.note-commands {
  flex-shrink: 0;
}
.note-commands__hint {
  margin: 0 0 var(--sp-3);
  color: var(--theme-dim);
  font-size: var(--text-xs);
  line-height: 1.6;
}
.note-commands__save,
.note-commands__heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.note-commands__save {
  margin-bottom: var(--sp-3);
  color: var(--theme-accent);
  font-size: var(--text-xs);
}
.note-commands kbd {
  margin-left: auto;
  padding: 3px 6px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-control);
  background: var(--glass-card);
  color: var(--theme-dim);
  font-size: var(--text-2xs);
}
.note-commands__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2);
  padding: 0;
  margin: 0;
  list-style: none;
}
.note-commands li {
  min-width: 0;
  padding: var(--sp-3);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--glass-card);
  transition:
    border-color var(--dur-fast) ease,
    background var(--dur-fast) ease;
}
.note-commands.is-open li {
  animation: command-reveal 260ms var(--ease-out) both;
  animation-delay: var(--command-delay);
}
.note-commands li:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--glass-border));
}
.note-commands__heading {
  color: var(--theme-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}
.note-commands__icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-control);
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
}
.note-commands code {
  display: block;
  margin-top: var(--sp-2);
  color: var(--theme-dim);
  font-size: var(--text-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@keyframes command-reveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (max-width: 600px) {
  .note-commands__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .note-commands.is-open li {
    animation: none;
  }
  .note-commands li {
    transition: none;
  }
}
</style>
