<script setup lang="ts">
// What a gated operation (merge, production dispatch, …) answers: nothing has
// happened yet. The request waits in the approval inbox until an admin approves
// it with their password, so this says so and links there.
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { short, type Gated } from '@/control/api'
import { when } from '@/trading/format'

defineProps<{ gated: Gated }>()
const router = useRouter()
</script>

<template>
  <div class="cc-notice cc-notice--warning" role="status">
    <p class="cc-notice__title">Approval required</p>
    <div class="cc-form">
      <span class="tp-note"
        >Nothing has run yet. {{ gated.kind }} on {{ gated.target }} waits for an admin to approve
        it with their password. It expires {{ when(gated.expires_at) }}. Artifact
        {{ short(gated.artifact_sha256) }}.</span
      >
      <div class="tp-row">
        <Button
          size="sm"
          variant="secondary"
          @click="router.push({ path: '/dev/inbox', query: { id: gated.approval_id } })"
          >Open in the approval inbox</Button
        >
      </div>
    </div>
  </div>
</template>
