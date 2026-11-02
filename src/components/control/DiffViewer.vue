<script setup lang="ts">
// A unified diff: monospace, in its own scroll box, lines wrapping on a phone.
// Capped at DIFF_MAX_LINES rows (src/control/diff.ts) so a huge diff cannot
// lock the page; the cap and any server-side truncation are both said.
import { computed } from 'vue'
import { DIFF_MAX_LINES, parseDiff } from '@/control/diff'

const props = withDefaults(
  defineProps<{
    text: string
    max?: number
    /** The server cut the diff (GITHUB_DIFF_MAX_BYTES or GitHub's own limit). */
    truncated?: boolean
    label?: string
  }>(),
  { max: DIFF_MAX_LINES, truncated: false, label: 'Diff' },
)
const parsed = computed(() => parseDiff(props.text, props.max))
const fmt = new Intl.NumberFormat('en-IN')
</script>

<template>
  <div class="cc-diff">
    <p v-if="!parsed.lines.length" class="tp-note">The diff is empty.</p>
    <template v-else>
      <div class="cc-box cc-mono" role="region" :aria-label="label" tabindex="0">
        <p
          v-for="l in parsed.lines"
          :key="l.n"
          class="cc-line cc-diff__line"
          :class="`cc-diff__line--${l.kind}`"
        >
          {{ l.text || ' ' }}
        </p>
      </div>
      <p v-if="parsed.capped" class="tp-note" role="status">
        Showing the first {{ fmt.format(parsed.lines.length) }} of
        {{ fmt.format(parsed.total) }} lines. Open the pull request on GitHub for the rest.
      </p>
    </template>
    <p v-if="truncated" class="tp-note" role="status">
      The server cut this diff at its size limit, so the end is missing.
    </p>
  </div>
</template>

<style scoped>
.cc-diff {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.cc-diff__line {
  border-left: 3px solid transparent;
}
.cc-diff__line--add {
  border-left-color: var(--theme-success);
  background: color-mix(in oklab, var(--theme-success) 12%, transparent);
}
.cc-diff__line--del {
  border-left-color: var(--theme-danger);
  background: color-mix(in oklab, var(--theme-danger) 12%, transparent);
}
.cc-diff__line--hunk {
  border-left-color: var(--theme-accent);
  background: color-mix(in oklab, var(--theme-accent) 10%, transparent);
}
.cc-diff__line--file {
  font-weight: var(--weight-semibold);
  border-left-color: var(--theme-border);
}
.cc-diff__line--meta {
  color: var(--text-secondary);
}
</style>
