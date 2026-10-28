<script setup lang="ts">
// Everything learnt across a milestone, read in one place: how many of its
// points have something written down, then each point's learnings with their
// examples. Read-only — the learnings are edited on the point itself, which is
// where the context for them is.
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Icon from '@/components/ui/Icon.vue'
import { learningProgress } from '@/utils/milestoneTracking'

const props = defineProps<{ goalId: number }>()
const emit = defineEmits<{ 'open-point': [number] }>()
const app = useAppStore()

const points = computed(() =>
  app.goalChecklist.filter((c) => c.goalId === props.goalId).sort((a, b) => a.order - b.order),
)
const progress = computed(() => learningProgress(points.value))
const withLearnings = computed(() => points.value.filter((p) => p.learnings?.length))
</script>

<template>
  <div class="mlearn">
    <div class="mlearn__progress">
      <ProgressBar size="sm" solid :value="progress.covered" :max="Math.max(1, progress.total)" />
      <span class="mlearn__dim">
        {{ progress.covered }} of {{ progress.total }} points · {{ progress.learnings }} learning{{
          progress.learnings === 1 ? '' : 's'
        }}
        · {{ progress.examples }} example{{ progress.examples === 1 ? '' : 's' }}
      </span>
    </div>

    <p v-if="!withLearnings.length" class="mlearn__dim">
      Nothing written down yet. Open a point's <strong>Learnt</strong> button and add what it taught
      you, with an example — e.g. “Closures capture variables, not values” with the classic
      <code>for (var i…)</code> loop.
    </p>

    <section v-for="p in withLearnings" :key="p.id" class="mlearn__point">
      <button type="button" class="mlearn__pointtitle" @click="emit('open-point', p.id)">
        <span class="mlearn__tick" :class="{ 'is-done': p.done }" aria-hidden="true">
          <Icon v-if="p.done" name="check" size="xs" />
        </span>
        {{ p.text || 'Untitled point' }}
      </button>
      <ol class="mlearn__list">
        <li v-for="l in p.learnings" :key="l.id">
          <span class="mlearn__text">{{ l.text }}</span>
          <template v-for="e in l.examples" :key="e.id">
            <pre v-if="e.kind === 'code' && e.body.trim()" class="mlearn__code">{{ e.body }}</pre>
            <p v-else-if="e.body.trim()" class="mlearn__eg">e.g. {{ e.body }}</p>
          </template>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.mlearn {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}
.mlearn__progress {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}
.mlearn__dim {
  margin: 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
}
.mlearn__dim code {
  font-family: var(--font-mono);
}
.mlearn__point {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.mlearn__pointtitle {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  text-align: left;
  cursor: pointer;
}
.mlearn__pointtitle:hover {
  color: var(--theme-accent);
}
.mlearn__tick {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--glass-border);
  color: var(--theme-on-accent, #fff);
  font-size: var(--text-2xs);
}
.mlearn__tick.is-done {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
}
.mlearn__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: 0;
  padding-left: 40px;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}
.mlearn__text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.mlearn__code {
  min-width: 0;
  margin: var(--sp-1) 0 0;
  padding: var(--sp-2) var(--sp-3);
  overflow-x: auto;
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--theme-text) 6%, transparent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  white-space: pre;
}
.mlearn__eg {
  min-width: 0;
  margin: 2px 0 0;
  color: var(--theme-dim);
  font-size: var(--text-xs);
  font-style: italic;
  overflow-wrap: anywhere;
}
</style>
