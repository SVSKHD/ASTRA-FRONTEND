<script setup lang="ts">
import { computed } from 'vue'
import { sanitize } from '@/utils/sanitizeHtml'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { formatINR } from '@/utils/currency'

const app = useAppStore()
const { c, s } = useStyles()
const { sharedView } = storeToRefs(app)

const isNotFound = computed(() => !!(sharedView.value && sharedView.value.notFound))

const summaryLines = computed<string[]>(() => {
  const sv = sharedView.value
  if (!sv || !sv.type || isNotFound.value) return []
  const it = (sv.item || {}) as Record<string, string | number>
  const lines: string[] = []
  if (sv.type === 'todo') lines.push(String(it.text ?? ''))
  if (sv.type === 'task') {
    lines.push(String(it.title ?? ''))
    if (it.tag) lines.push('Tag: ' + it.tag)
    if (it.deadline) lines.push('Due: ' + it.deadline)
    if (it.repo) lines.push('Repo: ' + it.repo)
  }
  if (sv.type === 'deadline') {
    lines.push(String(it.title ?? ''))
    lines.push('Due: ' + it.due)
  }
  if (sv.type === 'reminder') {
    lines.push(String(it.title ?? ''))
    if (it.note) lines.push(String(it.note))
    lines.push('Starts: ' + it.start)
  }
  if (sv.type === 'finance') {
    lines.push(String(it.note || it.category || ''))
    lines.push(formatINR(Number(it.amount || 0)) + ' · ' + it.category)
  }
  return lines
})
const isNote = computed(() => sharedView.value?.type === 'note')
// Same as the share page: this is another user's content in your browser.
const noteHtml = computed(() => sanitize((sharedView.value?.item?.text as string) || ''))
const linesStyle = pxify({ display: 'flex', flexDirection: 'column', gap: 6, ...typeStep('sm') })
const noteStyle = computed(() => pxify({ ...typeStep('sm'), lineHeight: 1.5, color: c.value.text }))
</script>

<template>
  <template v-if="sharedView">
    <div :style="s.dialogOverlay"></div>
    <div :style="s.shareCard">
      <template v-if="isNotFound">
        <span :style="s.drawerTitle">Not found in this universe</span>
        <span :style="s.finMeta">This link doesn't point to anything here.</span>
        <div :style="s.dialogActions">
          <button :style="s.saveBtn" @click="app.dismissShared()">Back to Aureon</button>
        </div>
      </template>
      <template v-else-if="sharedView.type">
        <span :style="s.drawerTitle">Shared {{ sharedView.type }}</span>
        <div :style="s.taskMain">
          <div v-if="isNote" :style="noteStyle" v-html="noteHtml"></div>
          <div v-else :style="[linesStyle, { color: c.text }]">
            <span v-for="(l, i) in summaryLines" :key="i">{{ l }}</span>
          </div>
        </div>
        <div :style="s.dialogActions">
          <button :style="s.saveBtn" @click="app.addSharedItem()">Add to my Aureon</button>
          <button :style="s.cancelBtn" @click="app.dismissShared()">Dismiss</button>
        </div>
      </template>
    </div>
  </template>
</template>
