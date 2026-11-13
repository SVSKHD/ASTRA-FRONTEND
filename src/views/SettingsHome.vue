<script setup lang="ts">
// /settings on the home stage (WorkspaceView puts this where a tab would be).
// Settings are the server's and admin-only, so this checks the Aureon session —
// the same one the workspace signed in with — and says so plainly to anyone else
// rather than letting every request fail. The page itself is the control center's
// Settings module, so both places show one page.
import { computed, onMounted } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CcSettings from '@/components/control/CcSettings.vue'
import { checkSession, isAdmin, tradingSession } from '@/trading/session'
import { useStyles } from '@/composables/useStyles'
// The Dhan connection bar (shared with /trading) lays out with these; tiny and
// fully `.tp-`-scoped, so loading them on the home stage changes nothing else.
import '@/components/trading/trading.css'

const { panelStyle } = useStyles()
onMounted(() => {
  if (!tradingSession.checked) void checkSession()
})
const admin = computed(() => !!tradingSession.user && isAdmin())

defineExpose({ focus: () => {} })
</script>

<template>
  <div :style="panelStyle" class="settings-home" data-testid="settings-home">
    <Skeleton v-if="!tradingSession.checked" :lines="8" aria-busy="true" />
    <EmptyState
      v-else-if="!tradingSession.user"
      title="Sign in to Aureon for Settings"
      description="Settings are kept on the Aureon server. Sign in from the trading panel or the control center, then come back."
    />
    <EmptyState
      v-else-if="!admin"
      title="Settings are for admins"
      description="Your account can use the app, but only an admin can change the server's settings and secrets."
    />
    <CcSettings v-else />
  </div>
</template>

<style scoped>
.settings-home {
  min-width: 0;
}
</style>
