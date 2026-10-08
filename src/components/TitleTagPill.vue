<script setup lang="ts">
// The tag as a coloured pill in front of a todo or task title, so the tag reads
// apart from the title at a glance. Same colours as every other tag chip.
//
// inline-block on purpose: a done row strikes its title through, and
// text-decoration does not carry into inline-block children — the tag is not
// what was finished.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, tagChip, typeStep } from '@/styles'

const props = defineProps<{ tag: string }>()
const { c, dark } = useStyles()

const style = computed(() =>
  pxify({
    ...tagChip(c.value, props.tag, dark.value),
    display: 'inline-block',
    alignSelf: undefined,
    verticalAlign: 'middle',
    marginRight: 'var(--sp-2)',
    whiteSpace: 'nowrap',
    ...typeStep('xs'),
    lineHeight: 1.3,
    fontWeight: 'var(--weight-semibold)',
  }),
)
</script>

<template>
  <span :style="style">{{ tag.trim().toLocaleUpperCase() }}</span>
</template>
