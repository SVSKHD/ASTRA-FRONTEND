<script setup lang="ts">
// Import milestones, as a dialog over the workspace rather than a page of its
// own. The screen inside is the same GoalsImportView the /import/goals route
// shows, so a pasted link, JSON or a dropped file behaves the same in both.
// The Modal renders it only while open, so each open starts fresh and picks up
// the help panel's sample seed; it is fetched on the first open.
import { defineAsyncComponent } from 'vue'
import { useAppStore } from '@/stores/app'
import Modal from '@/components/ui/Modal.vue'

const GoalsImportView = defineAsyncComponent(() => import('@/views/GoalsImportView.vue'))
const app = useAppStore()
</script>

<template>
  <Modal
    :open="app.goalImportOpen"
    title="Import milestones"
    size="lg"
    @close="app.closeGoalImport()"
  >
    <GoalsImportView embedded @done="app.closeGoalImport()" />
  </Modal>
</template>
