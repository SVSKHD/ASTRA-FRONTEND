<script setup lang="ts">
// Receipts on a transaction (section 27b).
//
// A thumbnail where there is an image and a named chip where there is not,
// because a PDF has no preview and a grey box with a filename under it is worse
// than the filename alone.
//
// The file input is the one native control in the app, and deliberately: the
// picker it opens is the OS's, there is no styleable alternative, and unlike a
// native <select> it renders nothing of its own — the visible control is the
// label, which is ours. The input is hidden from sight but not from assistive
// tech or the keyboard.
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Alert from '@/components/ui/Alert.vue'
import {
  ACCEPT_ATTR,
  formatBytes,
  isImage,
  MAX_PER_TXN,
  triageFiles,
  type Attachment,
} from '@/utils/attachments'

const props = withDefaults(
  defineProps<{ attachments: Attachment[]; busy?: boolean; readonly?: boolean }>(),
  { attachments: () => [] },
)
const emit = defineEmits<{ add: [files: File[]]; remove: [id: string] }>()

const input = ref<HTMLInputElement | null>(null)
const rejections = ref<string[]>([])

const full = computed(() => props.attachments.length >= MAX_PER_TXN)

function onPick(event: Event): void {
  const picked = Array.from((event.target as HTMLInputElement).files ?? [])
  const { accepted, rejected } = triageFiles(picked, props.attachments.length)
  rejections.value = rejected.map((r) => `${r.name}: ${r.reason}`)
  if (accepted.length) emit('add', accepted)
  // Cleared so picking the same file twice in a row still fires a change event.
  if (input.value) input.value.value = ''
}
</script>

<template>
  <div class="att">
    <ul v-if="attachments.length" class="att__list">
      <li v-for="file in attachments" :key="file.id" class="att__item">
        <a class="att__link" :href="file.url" target="_blank" rel="noopener noreferrer">
          <img
            v-if="isImage(file.contentType)"
            class="att__thumb"
            :src="file.url"
            :alt="file.name"
            loading="lazy"
          />
          <span v-else class="att__thumb att__thumb--doc" aria-hidden="true">
            <Icon name="paperclip" size="sm" />
          </span>
          <span class="att__meta">
            <span class="att__name">{{ file.name }}</span>
            <span class="att__size">{{ formatBytes(file.size) }}</span>
          </span>
        </a>
        <IconButton
          v-if="!readonly"
          class="att__remove"
          :label="`Remove ${file.name}`"
          size="sm"
          :disabled="busy"
          @click="emit('remove', file.id)"
        >
          <Icon name="x" size="xs" />
        </IconButton>
      </li>
    </ul>

    <label v-if="!readonly && !full" class="att__add">
      <input
        ref="input"
        class="att__hidden-input"
        type="file"
        multiple
        :accept="ACCEPT_ATTR"
        :disabled="busy"
        @change="onPick"
      />
      <Icon name="paperclip" size="xs" />
      <span>{{ busy ? 'Uploading…' : 'Attach receipt' }}</span>
    </label>

    <!-- Named rather than counted: "2 files were rejected" leaves the reader to
         work out which two and why, which is the whole of the information. -->
    <Alert v-if="rejections.length" tone="warning" dismissible @dismiss="rejections = []">
      {{ rejections.join(' · ') }}
    </Alert>
  </div>
</template>

<style scoped>
.att {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
}
.att__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.att__item {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  max-width: 240px;
  padding: var(--sp-1);
  border: 1px solid var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-control, 6px);
  background: var(--bg-elevated, var(--glass-card));
}
.att__link {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.att__thumb {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control, 6px);
  object-fit: cover;
  background: var(--bg-base, var(--theme-bg));
}
.att__thumb--doc {
  display: grid;
  place-items: center;
  color: var(--text-secondary, var(--theme-dim));
}
.att__meta {
  display: grid;
  min-width: 0;
}
.att__name {
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-primary, var(--theme-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.att__size {
  min-width: 0;
  font-size: var(--text-2xs);
  line-height: var(--lh-2xs);
  color: var(--text-muted, var(--theme-dim));
  font-variant-numeric: tabular-nums;
}
.att__remove {
  flex-shrink: 0;
}
.att__add {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  align-self: start;
  padding: var(--sp-1) var(--sp-2);
  border: 1px dashed var(--border-subtle, var(--glass-border));
  border-radius: var(--radius-control, 6px);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
  cursor: pointer;
}
.att__add:hover {
  color: var(--text-primary, var(--theme-text));
}
/* Hidden from sight, not from the keyboard or a screen reader: clip rather than
   `display: none`, which would take it out of the tab order entirely. */
.att__hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.att__add:focus-within {
  outline: 2px solid var(--theme-accent);
  outline-offset: 1px;
}
</style>
