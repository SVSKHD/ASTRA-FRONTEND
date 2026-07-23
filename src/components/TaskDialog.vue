<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify } from '@/styles'
import StatusPill from '@/components/StatusPill.vue'
import TagPicker from '@/components/TagPicker.vue'
import type { PullRequest, Task } from '@/types'

const app = useAppStore()
const auth = useAuthStore()
const { c, dark, s } = useStyles()
const { dialogTaskId, dialogClosing, tasks, githubCache, approvedPRs } = storeToRefs(app)
const { githubLinked } = storeToRefs(auth)

const task = computed<Task | undefined>(() => tasks.value.find((t) => t.id === dialogTaskId.value))
const gh = computed(() => (task.value ? githubCache.value[task.value.id] : undefined))

const dialogCardStyle = computed(() =>
  pxify({
    position: 'fixed',
    top: '50%',
    left: '50%',
    zIndex: 16,
    width: 'min(92vw,460px)',
    maxHeight: '86vh',
    overflowY: 'auto',
    background: c.value.glass,
    backdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    borderRadius: 26,
    padding: 22,
    boxShadow: c.value.shadow,
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    animation: dialogClosing.value
      ? 'springOut .22s ease forwards'
      : 'springIn .4s cubic-bezier(.34,1.56,.64,1) both',
  }),
)

const connChipStyle = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid ' + (githubLinked.value ? 'oklch(0.68 0.15 145)' : c.value.border),
    background: githubLinked.value ? 'rgba(90,200,140,0.14)' : 'transparent',
    color: githubLinked.value
      ? dark.value
        ? 'oklch(0.82 0.15 145)'
        : 'oklch(0.48 0.15 145)'
      : c.value.dim,
    boxShadow: githubLinked.value ? '0 0 12px rgba(90,200,140,0.3)' : 'none',
    letterSpacing: '0.04em',
  }),
)
const connDotStyle = computed(() =>
  pxify({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: githubLinked.value ? 'oklch(0.72 0.16 145)' : c.value.dim,
    boxShadow: githubLinked.value ? '0 0 8px oklch(0.72 0.16 145)' : 'none',
  }),
)
const approvedChip = computed(() =>
  pxify({
    flexShrink: 0,
    fontSize: 9,
    fontWeight: 600,
    padding: '4px 9px',
    borderRadius: 7,
    color: dark.value ? 'oklch(0.82 0.15 145)' : 'oklch(0.45 0.15 145)',
    background: 'rgba(90,200,140,0.16)',
    border: '1px solid oklch(0.68 0.15 145)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }),
)
function ciStyle(ci: string) {
  return pxify({
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 6,
    color: ci === 'passing' ? 'oklch(0.7 0.15 145)' : 'oklch(0.65 0.2 25)',
    background: ci === 'passing' ? 'rgba(90,200,140,0.15)' : 'rgba(255,90,90,0.15)',
  })
}
const connLabel = computed(() => (githubLinked.value ? 'GitHub connected' : 'GitHub not connected'))
const prList = computed<(PullRequest & { approved: boolean })[]>(() => {
  const g = gh.value
  if (!g || g.status !== 'ready') return []
  return g.data.prList.map((pr) => ({ ...pr, approved: !!approvedPRs.value[pr.id] }))
})

function upd(field: keyof Task, e: Event) {
  if (!task.value) return
  app.updateTask(task.value.id, field, (e.target as HTMLInputElement).value)
}
function onDelete() {
  if (!task.value) return
  app.deleteWithUndo('tasks', 'task', task.value.id)
  app.closeDialog()
}
// Fields already write through on input, so Update confirms and dismisses
// rather than committing — Enter is bound to the same action so the keyboard
// path matches the button.
function onEnter(e: KeyboardEvent) {
  // Enter is a newline in the notes textarea, and activates a focused button
  // (status toggle, PR approve, Connect) — in neither case is it a confirmation.
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'TEXTAREA' || tag === 'BUTTON') return
  e.preventDefault()
  app.closeDialog()
}
</script>

<template>
  <template v-if="dialogTaskId != null && task">
    <div :style="s.dialogOverlay" @click="app.closeDialog()"></div>
    <div :style="dialogCardStyle" @keydown.enter="onEnter" @keydown.esc="app.closeDialog()">
      <div :style="s.dialogHeader">
        <input :style="s.dialogTitleInput" :value="task.title" @input="upd('title', $event)" />
        <button :style="s.del" @click="app.closeDialog()">×</button>
      </div>
      <div :style="s.dialogRow">
        <StatusPill :status="task.status" @cycle="app.cycleTaskStatus(task.id)" />
        <input
          :style="s.editInputSmall"
          type="date"
          :value="task.deadline"
          @input="upd('deadline', $event)"
        />
      </div>
      <TagPicker
        :model-value="task.tag"
        label="Project tag"
        @update:model-value="app.updateTask(task.id, 'tag', $event)"
      />
      <textarea
        :style="s.dialogNotes"
        placeholder="Notes…"
        :value="task.notes"
        @input="upd('notes', $event)"
      ></textarea>

      <div :style="s.dialogGithub">
        <div :style="s.ghConnRow">
          <span :style="connChipStyle"><span :style="connDotStyle"></span>{{ connLabel }}</span>
          <button v-if="!githubLinked" :style="s.saveBtn" @click="auth.openAuth()">Connect</button>
        </div>
        <div :style="s.inputRow">
          <input
            :style="s.input"
            placeholder="owner/repo"
            :value="task.repo"
            @input="upd('repo', $event)"
          />
          <button
            :style="s.addBtn"
            v-hover-style="s.addBtnHover"
            @click="app.attachRepo(task.id, task.repo)"
          >
            ↻
          </button>
        </div>
        <div v-if="gh && gh.status === 'loading'" :style="s.ghShimmer"></div>
        <template v-else-if="gh && gh.status === 'ready'">
          <div :style="s.ghGrid">
            <div :style="s.ghItem">
              <span :style="s.ghLabel">Branch</span
              ><span :style="s.ghVal">{{ gh.data.branch }}</span>
            </div>
            <div :style="s.ghItem">
              <span :style="s.ghLabel">Issues</span
              ><span :style="s.ghVal">{{ gh.data.issues }}</span>
            </div>
            <div :style="s.ghItem">
              <span :style="s.ghLabel">PRs</span><span :style="s.ghVal">{{ gh.data.prs }}</span>
            </div>
            <div :style="s.ghItem">
              <span :style="s.ghLabel">Stars</span><span :style="s.ghVal">{{ gh.data.stars }}</span>
            </div>
            <div :style="s.ghItem">
              <span :style="s.ghLabel">CI</span
              ><span :style="ciStyle(gh.data.ci)">{{ gh.data.ci }}</span>
            </div>
            <div :style="s.ghItem">
              <span :style="s.ghLabel">Last commit</span>
              <span :style="s.ghVal">{{ gh.data.commitMsg }} · {{ gh.data.commitTime }}</span>
            </div>
          </div>
          <div v-if="prList.length" :style="s.ghSection">
            <span :style="s.ghLabel">Open pull requests</span>
            <div v-for="pr in prList" :key="pr.id" :style="s.ghIssueRow">
              <a :href="pr.url" target="_blank" rel="noopener" :style="s.prLink"
                >#{{ pr.num }} · {{ pr.title }}</a
              >
              <span v-if="pr.approved" :style="approvedChip">Approved</span>
              <button v-else :style="s.importBtn" @click="app.approvePR(pr)">Approve</button>
            </div>
          </div>
        </template>
      </div>

      <div :style="s.dialogActions">
        <button :style="s.saveBtn" @click="app.closeDialog()">Update</button>
        <button :style="s.editBtn" @click="app.share('task', task)">Share</button>
        <button :style="s.cancelBtn" @click="onDelete">Delete</button>
      </div>
    </div>
  </template>
</template>
