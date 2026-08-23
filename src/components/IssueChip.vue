<script setup lang="ts">
// The `#123 · open` chip a linked task wears (13c). Coloured by issue state,
// click-through to GitHub. Used by the task dialog, the task row and the task
// view, so the colour rule lives in exactly one place.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { issueChipLabel, issueStateColor } from '@/utils/githubModel'
import type { GithubLink } from '@/types'

const props = defineProps<{ link: GithubLink; compact?: boolean }>()

const { c } = useStyles()
const col = computed(() => issueStateColor(props.link.state))
const label = computed(() => issueChipLabel(props.link))

const chipStyle = computed(() =>
  pxify({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    flexShrink: 0,
    ...typeStep('2xs'),
    fontWeight: 'var(--weight-semibold)',
    padding: props.compact ? '2px 6px' : '3px 8px',
    borderRadius: 'var(--radius-control)',
    border: '1px solid ' + col.value,
    background: 'color-mix(in oklch, ' + col.value + ' 16%, transparent)',
    color: col.value,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    letterSpacing: '0.03em',
  }),
)
const dotStyle = computed(() =>
  pxify({
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: props.link.state === 'open' ? col.value : c.value.glass,
    border: '1px solid ' + col.value,
  }),
)
</script>

<template>
  <a
    :style="chipStyle"
    :href="link.issueUrl"
    target="_blank"
    rel="noopener noreferrer"
    :title="'Open ' + label + ' on GitHub'"
    @click.stop
  >
    <span :style="dotStyle"></span>{{ label }}
  </a>
</template>
