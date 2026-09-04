<script setup lang="ts">
// The header strip for the tabs that are a plain list rather than a day
// accordion. Its only job is to open the create dialog — which is the whole
// point: the add-form that used to sit here is now in the dialog, and the tab
// keeps the space.
import { useStyles } from '@/composables/useStyles'

// `newLabel` is optional: the News and Code tabs are read-only views of things
// that happen elsewhere, and a create button on them would be a button with
// nothing to create (sections 39–40).
defineProps<{ title: string; newLabel?: string }>()
defineEmits<{ (e: 'new'): void }>()

const { s } = useStyles()
</script>

<template>
  <div :style="s.dayToolbar">
    <span :style="s.dayGroupLabelBase">{{ title }}</span>
    <!-- Optional header actions (e.g. a link expand/collapse toggle) sit between
         the title and the create button. -->
    <slot name="actions" />
    <button v-if="newLabel" :style="s.newBtn" v-hover-style="s.addBtnHover" @click="$emit('new')">
      + {{ newLabel }}
    </button>
  </div>
</template>
