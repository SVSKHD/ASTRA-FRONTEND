<script setup lang="ts">
// The services the server is connected to (GitHub, OpenRouter, brokers, …), as it
// reports them. Never their credentials: only connected or not, and why.
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import type { CapabilityService } from '@/hub/capabilities'

defineProps<{ services: CapabilityService[] }>()
</script>

<template>
  <Card title="Connected services" data-testid="services">
    <ul v-if="services.length" class="tp-list">
      <li v-for="s in services" :key="s.id" class="tp-item">
        <div class="tp-main">
          <span class="tp-strong">{{ s.name }}</span>
          <span v-if="s.detail" class="tp-note">{{ s.detail }}</span>
        </div>
        <Badge
          :tone="s.connected ? 'success' : 'neutral'"
          :label="s.connected ? 'Connected' : 'Not connected'"
        />
      </li>
    </ul>
    <p v-else class="tp-note">The server reports no services.</p>
  </Card>
</template>
