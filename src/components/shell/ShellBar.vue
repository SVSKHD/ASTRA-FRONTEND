<script setup lang="ts">
// The bottom utility bar (section 44, items 4–5; Todo v2, 1b).
//
// ONE CENTRED, LABELLED PILL. The bar used to be eight icon buttons in two
// groups, and two of them were suns that did different things — the left one
// opened the account menu, which the avatar also opened — while three separate
// buttons changed the theme and GitHub wore a share icon. It is now four
// labelled controls and the sync status:
//
//   Notes · Appearance · Account · GitHub  |  ● Synced
//
// Mode (dark / light / auto), the espresso roast and the theme grid all live in
// the Appearance popover, and only one panel is open at a time. Under 900px the
// labels drop and it is icons only. On a phone the bar is not drawn at all: the
// same four live in the tab bar's More sheet (MobileTabBar), because two bars
// stacked on a 390px screen is one too many.
//
// IT FLOATS, BUT IN ITS OWN ROW. The pill is centred INSIDE the bar's grid
// region, lifted off the window edge by the bar's bottom padding and shadowed
// like floating glass — but never `position: fixed` over the page, so the
// content area above keeps stopping where the bar starts and the last row of a
// table stays clear (appShell.ts).
//
// Popovers open upward, absolutely positioned against their own button's
// wrapper. An overlay that opens on demand and closes on Escape is not
// persistent chrome and does not need a region.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useStyles } from '@/composables/useStyles'
import { pxify, typeStep } from '@/styles'
import { barGeometry } from '@/views/appShell'
import Icon from '@/components/ui/Icon.vue'
import ShellSync from '@/components/shell/ShellSync.vue'
import AppearancePanel from '@/components/shell/AppearancePanel.vue'
import AccountMenu from '@/components/shell/AccountMenu.vue'

const ui = useUiStore()
const auth = useAuthStore()
const { c, B } = useStyles()
const { themePanelOpen, isPhone, drawerOpen } = storeToRefs(ui)
const { avatarMenuOpen, avatarInitial, avatarColor } = storeToRefs(auth)

const bar = computed(() =>
  pxify({ ...barGeometry({ isPhone: isPhone.value }), justifyContent: 'center' }),
)

function open(name: 'notes' | 'appearance' | 'account') {
  ui.openShellPanel(name, avatarMenuOpen)
}
function openGithub() {
  ui.openShellPanel(null, avatarMenuOpen)
  auth.openGithubPanel()
}

// --- styles -------------------------------------------------------------------
// The glass is painted by `.shell-pill::before` in the stylesheet, not here: an
// element with a backdrop-filter becomes the backdrop root for everything inside
// it, so the popovers — which are inside it — would blur the pill's own empty
// box instead of the page and render see-through.
//
// The pill is a stacking context (so `::before` can sit under its buttons), and
// its popovers are trapped inside it — so the pill itself carries the popover
// layer, above whatever the page stacks in the content region.
const pill = computed(() =>
  pxify({
    position: 'relative',
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
    maxWidth: '100%',
    padding: 6,
    borderRadius: 'var(--radius-pill)',
    '--pill-glass': c.value.glass,
    border: B.value,
    // A floating island: lifted off the window edge by the bar's bottom padding
    // (BAR_LIFT) and given the same drop shadow as the app's other floating glass.
    boxShadow: c.value.shadow + ', inset 0 1px 0 color-mix(in srgb, white 7%, transparent)',
  }),
)
const wrapRel = pxify({ position: 'relative', display: 'inline-flex' })
const divider = computed(() =>
  pxify({ width: 1, height: 22, background: c.value.border, margin: '0 6px', flexShrink: 0 }),
)
const avatarDisc = computed(() =>
  pxify({
    width: 20,
    height: 20,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    ...typeStep('2xs'),
    color: 'var(--theme-on-accent)',
    background: avatarColor.value,
    flexShrink: 0,
  }),
)
function popover(width: number) {
  return pxify({
    position: 'absolute',
    bottom: 'calc(100% + 14px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'min(70vh, 560px)',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    '-webkit-backdrop-filter': 'blur(28px) saturate(1.6)',
    border: B.value,
    borderRadius: 'var(--radius-dialog)',
    padding: 12,
    boxShadow: c.value.shadow,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-3)',
    zIndex: 30,
  })
}
const accountPopover = computed(() => ({ ...popover(240), padding: '10px' }))
const appearancePopover = computed(() => popover(300))
const groupLabel = computed(() => pxify({ ...typeStep('2xs'), color: c.value.dim }))
</script>

<template>
  <footer :style="bar" class="shell-bar">
    <div :style="pill" class="shell-pill">
      <button
        type="button"
        class="pill-btn"
        :class="{ 'is-on': drawerOpen }"
        aria-label="Notes"
        :aria-expanded="drawerOpen"
        @click="open('notes')"
      >
        <Icon name="notebook" size="sm" class="pill-icon" />
        <span class="pill-label">Notes</span>
      </button>

      <div :style="wrapRel">
        <button
          type="button"
          class="pill-btn"
          :class="{ 'is-on': themePanelOpen }"
          aria-label="Appearance"
          :aria-expanded="themePanelOpen"
          @click="open('appearance')"
        >
          <Icon name="palette" size="sm" class="pill-icon" />
          <span class="pill-label">Appearance</span>
        </button>
        <div v-if="themePanelOpen" :style="appearancePopover" role="menu">
          <span :style="groupLabel">Appearance</span>
          <AppearancePanel />
        </div>
      </div>

      <div :style="wrapRel">
        <button
          type="button"
          class="pill-btn"
          :class="{ 'is-on': avatarMenuOpen }"
          aria-label="Account"
          :aria-expanded="avatarMenuOpen"
          @click="open('account')"
        >
          <span :style="avatarDisc">{{ avatarInitial }}</span>
          <span class="pill-label">Account</span>
        </button>
        <div v-if="avatarMenuOpen" :style="accountPopover">
          <AccountMenu />
        </div>
      </div>

      <button type="button" class="pill-btn" aria-label="GitHub" @click="openGithub">
        <Icon name="github" size="sm" class="pill-icon" />
        <span class="pill-label">GitHub</span>
      </button>

      <span :style="divider"></span>
      <ShellSync inline />
    </div>
  </footer>
</template>

<style scoped>
/*
 * Hover and the open state are CSS, not v-hover-style: that directive snapshots
 * the style attribute on enter and restores it on leave, which is wrong for a
 * toggle clicked while the pointer is on it.
 */
.shell-pill::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--pill-glass);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
}
.pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-dim);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}
.pill-icon {
  color: var(--theme-accent);
}
.pill-btn:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
}
.pill-btn.is-on {
  background: color-mix(in srgb, var(--theme-text) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-text) 20%, transparent);
  color: var(--theme-text);
}
@media (max-width: 900px) {
  .pill-label {
    display: none;
  }
  .pill-btn {
    padding: 8px 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pill-btn {
    transition: none;
  }
}
</style>
