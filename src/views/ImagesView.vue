<script setup lang="ts">
// /images — the image studio on its own page, for any signed-in Aureon user
// (the images API is per user, not admin-only). The same studio is a module of
// the control center; this is the phone-first way in. It signs in to Aureon
// like /trading does (AureonPage).
import AureonPage from '@/components/AureonPage.vue'
import CcImages from '@/components/control/CcImages.vue'
</script>

<template>
  <AureonPage
    title="Images"
    subtitle="Generated on the Aureon server · nothing leaves it"
    gate-text="Images are generated and kept on the Aureon server. Sign in to use them."
  >
    <CcImages />
  </AureonPage>
</template>
