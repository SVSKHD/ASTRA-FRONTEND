<script setup lang="ts">
// The one control that moves a todo or a task through its lifecycle. Clicking
// cycles pending → in progress → done → pending; the parent owns the store call
// so the same pill works for both lists.
import { computed } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { pxify, statusPill } from '@/styles'
import { STATUS_LABEL, type ItemStatus } from '@/types'

const props = defineProps<{ status: ItemStatus }>()
defineEmits<{ (e: 'cycle'): void }>()

const { c } = useStyles()
const style = computed(() => pxify(statusPill(c.value, props.status)))
const label = computed(() => STATUS_LABEL[props.status] ?? STATUS_LABEL.pending)
</script>

<template>
  <button
    :style="style"
    :title="'Status: ' + label + ' — click to advance'"
    @click.stop="$emit('cycle')"
  >
    {{ label }}
  </button>
</template>
