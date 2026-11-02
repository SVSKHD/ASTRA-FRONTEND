<script setup lang="ts">
// The repository every GitHub module works on: one of the server's allowlisted
// repos. The choice is kept per browser (src/control/api.ts).
import { computed } from 'vue'
import Select from '@/components/ui/Select.vue'
import { cc, setRepo } from '@/control/api'
import { repos } from '@/control/repos'

const options = computed(() => repos.items.map((r) => ({ value: r.full_name, label: r.full_name })))
</script>

<template>
  <div class="cc-picker">
    <Select
      v-if="options.length"
      :model-value="cc.repo"
      :options="options"
      size="sm"
      aria-label="Repository"
      @update:model-value="setRepo"
    />
  </div>
</template>

<style scoped>
.cc-picker {
  min-width: 0;
  max-width: 100%;
}
</style>
