<script setup lang="ts">
// The approval controls, shown but OFF (Prompt 11, item 8). Turning a signal
// into an order needs Phase F (paper) and then Phase G (live, with its own
// written approval). Until then there is no endpoint behind these buttons.
import Button from '@/components/ui/Button.vue'
</script>

<template>
  <div class="appr" role="group" aria-label="Order approval (disabled)">
    <Button size="sm" variant="secondary" disabled title="Paper trading arrives in Phase F">
      Send to paper
    </Button>
    <Button
      size="sm"
      variant="secondary"
      disabled
      title="Live orders need Phase G and written approval"
    >
      Approve live
    </Button>
    <span class="appr__note">Order approval is off until Phase F / G.</span>
  </div>
</template>

<style scoped>
.appr {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
.appr__note {
  font-size: var(--text-2xs);
  color: var(--text-secondary);
}
</style>
