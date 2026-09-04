<script setup lang="ts">
// The five states of section 43, on one page, so they can be photographed
// together and compared (item 10).
//
// Together is the point. Each of the four loading treatments is defensible on
// its own and the rule they exist to serve — one job each, no overlap — is only
// checkable when they are side by side: a skeleton next to a shimmer next to a
// ring makes it obvious at a glance which one is saying what.
//
// DEV ONLY. It is registered inside the same `import.meta.env.DEV` branch as
// the rest of the harness, so it is absent from a production build rather than
// present and guarded.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SaveState from '@/components/ui/SaveState.vue'
import TopProgressBar from '@/components/ui/TopProgressBar.vue'
import UnsavedSheet from '@/components/ui/UnsavedSheet.vue'

const props = defineProps<{ show: string }>()

const sheetOpen = ref(props.show === 'unsaved')
</script>

<template>
  <!-- The workspace's own arrangement: one base pane over the starfield, panels
       on it. Two layers, never three — which is the rule the nesting guard in
       tokens.css enforces and the reason this page is built the same way the
       real stage is rather than as a flat list of cards. -->
  <div class="lstates ui-glass-base" data-ready="true">
    <!-- The top bar: fixed to the viewport, which is where it belongs and why
         it is the only treatment not attached to what it is about. -->
    <TopProgressBar :active="show === 'topbar' || show === 'all'" />

    <section class="lstates__panel ui-glass-raised">
      <h3 class="ui-label">Skeleton — first paint</h3>
      <p class="lstates__note">
        The shape of what is coming, at the real dimensions. Flat: a skeleton that also sweeps is
        two treatments on one element saying two different things.
      </p>
      <Skeleton :lines="3" height="14px" />
    </section>

    <section class="lstates__panel ui-glass-raised ui-shimmer">
      <h3 class="ui-label">Shimmer — refreshing in place</h3>
      <p class="lstates__note">
        Only ever over content that is already there. 120% wide, 1.8s, 400ms of rest, clipped to
        this panel's own radius.
      </p>
      <p class="lstates__row">Gold steadies above $2,400 after the decision</p>
      <p class="lstates__row">US CPI comes in at 2.9% year on year</p>
    </section>

    <section class="lstates__panel ui-glass-raised">
      <h3 class="ui-label">Ring, check, error — a save</h3>
      <p class="lstates__note">
        On the element being saved, replacing its icon. The box is the same size in all four states,
        so nothing under the cursor moves.
      </p>
      <div class="lstates__buttons">
        <Button state="idle">Log trade</Button>
        <Button state="working">Log trade</Button>
        <Button state="done">Log trade</Button>
        <Button state="failed">Log trade</Button>
      </div>
      <div class="lstates__row">
        <SaveState state="working" size="sm" />
        <SaveState state="done" size="sm" />
        <SaveState state="failed" size="sm" />
      </div>
    </section>

    <UnsavedSheet
      :open="sheetOpen"
      :fields="['Entry price', 'Exit price', 'Note']"
      @save="sheetOpen = false"
      @discard="sheetOpen = false"
      @back="sheetOpen = false"
    />
  </div>
</template>

<style scoped>
.lstates {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
  padding: var(--sp-4);
}
.lstates__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
  padding: var(--sp-4);
}
.lstates__note {
  margin: 0;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-secondary, var(--theme-dim));
}
.lstates__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  color: var(--text-primary, var(--theme-text));
}
.lstates__buttons {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  min-width: 0;
}
</style>
