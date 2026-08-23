<script setup lang="ts">
// The public-share globe. One button, two states:
//   OFF — outline globe, muted, "Make shareable".
//   ON  — filled globe in the theme accent with a soft glow, "Shared — click to
//         copy link".
// Primary click enables + copies (off) or re-copies (on). Turning it off lives
// behind the popover's "Stop sharing", reached by the caret, a right-click or a
// long-press — so a link people are holding is never revoked by a stray click.
//
// It owns no share logic of its own: everything routes through useShareLink,
// which is why the same button drops onto notes/ideas/trips later unchanged.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStyles } from '@/composables/useStyles'
import { useShareLink } from '@/composables/useShareLink'
import { useConnectivity } from '@/composables/useConnectivity'
import { pxify, typeStep } from '@/styles'
import type { ItemType, Shareable } from '@/types'
import Icon from '@/components/ui/Icon.vue'
import type { IconSize } from '@/components/ui/icons'

const props = defineProps<{
  entityType: ItemType
  item: ({ id: number } & Partial<Shareable>) | null | undefined
  // Row globes are compact; the dialog gives it a touch more room.
  variant?: 'row' | 'dialog'
}>()

const { c, isMobile } = useStyles()
const { isOnline } = useConnectivity()

// A ref onto the live item so the composable tracks it reactively.
const itemRef = computed(() => props.item ?? null)
const { isShared, busy, activate, stopSharing, copyLink, openLink } = useShareLink(
  props.entityType,
  itemRef,
)

const wrapEl = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuPos = ref<{ top: number; left: number }>({ top: 0, left: 0 })

// Replay the outline->filled pop whenever the state flips on.
const popKey = ref(0)
watch(isShared, (on, was) => {
  if (on && !was) popKey.value++
})

// Sharing needs the network — a public link can't be created, revoked or
// opened offline. The button greys out (never hides) with an explanatory tip.
const offline = computed(() => !isOnline.value)
const tooltip = computed(() =>
  offline.value
    ? 'Needs internet'
    : isShared.value
      ? 'Shared — click to copy link'
      : 'Make shareable',
)
const ariaLabel = computed(() =>
  offline.value
    ? 'Sharing needs an internet connection'
    : isShared.value
      ? 'Sharing on. Click to copy the public link, or open the menu to stop sharing.'
      : 'Make this shareable with a public link',
)

const hit = computed(() => (isMobile.value ? 40 : props.variant === 'dialog' ? 34 : 30))
// A step, not a pixel count (section 21e): the dialog's globe is one size up
// from the row's, and 19-versus-17 was never a distinction anybody could see.
const iconStep = computed<IconSize>(() => (props.variant === 'dialog' ? 'md' : 'sm'))

// --- menu (popover on desktop, bottom sheet on mobile) ----------------------
function openMenu() {
  if (!isShared.value || offline.value) return
  if (!isMobile.value) {
    const rect = wrapEl.value?.getBoundingClientRect()
    if (rect) {
      const width = 190
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
      const top = Math.min(rect.bottom + 6, window.innerHeight - 8)
      menuPos.value = { top, left }
    }
  }
  menuOpen.value = true
}
function closeMenu() {
  menuOpen.value = false
}
function onContext(e: MouseEvent) {
  if (!isShared.value) return
  e.preventDefault()
  openMenu()
}

// Long-press opens the menu on touch. A flag swallows the click that a touch
// also fires, so a long-press does not also re-copy the link.
let pressTimer: ReturnType<typeof setTimeout> | undefined
let longPressed = false
function onTouchStart() {
  if (!isShared.value) return
  longPressed = false
  pressTimer = setTimeout(() => {
    longPressed = true
    openMenu()
  }, 500)
}
function cancelPress() {
  clearTimeout(pressTimer)
}
onBeforeUnmount(cancelPress)

function onGlobeClick() {
  if (longPressed) {
    longPressed = false
    return
  }
  if (offline.value) return
  activate()
}
function onGlobeKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault()
    if (offline.value) return
    activate()
  }
}

function menuCopy() {
  copyLink()
  closeMenu()
}
function menuOpenLink() {
  openLink()
  closeMenu()
}
function menuStop() {
  stopSharing()
  closeMenu()
}

// --- styles -----------------------------------------------------------------
const globeStyle = computed(() =>
  pxify({
    flexShrink: 0,
    position: 'relative',
    width: hit.value,
    height: hit.value,
    borderRadius: 'var(--radius-card)',
    border: 'none',
    background: 'transparent',
    color: offline.value ? c.value.dim : isShared.value ? c.value.accent : c.value.dim,
    opacity: offline.value ? 0.4 : isShared.value ? 1 : busy.value ? 0.6 : 0.55,
    cursor: offline.value ? 'not-allowed' : busy.value ? 'progress' : 'pointer',
    display: 'grid',
    placeItems: 'center',
    transition: 'color .25s ease, opacity .25s ease',
    // The soft glow that reads as "lit" in the glass theme — dropped offline.
    filter:
      !offline.value && isShared.value ? 'drop-shadow(0 0 6px ' + c.value.accent + ')' : 'none',
  }),
)
const iconWrapStyle = computed(() =>
  pxify({
    display: 'grid',
    placeItems: 'center',
    animation: isShared.value ? 'globePop .32s cubic-bezier(.34,1.56,.64,1)' : 'none',
  }),
)
const caretStyle = computed(() =>
  pxify({
    flexShrink: 0,
    width: isMobile.value ? 22 : 14,
    height: hit.value,
    border: 'none',
    background: 'transparent',
    color: c.value.accent,
    cursor: 'pointer',
    padding: 0,
    display: 'grid',
    placeItems: 'center',
    opacity: 0.85,
  }),
)
const wrapStyle = pxify({ display: 'inline-flex', alignItems: 'center', gap: 0 })

const overlayStyle = pxify({ position: 'fixed', inset: 0, zIndex: 30 })
const menuStyle = computed(() => {
  const base = {
    position: 'fixed' as const,
    zIndex: 31,
    background: c.value.glass,
    backdropFilter: 'blur(28px) saturate(1.6)',
    border: '1px solid ' + c.value.border,
    color: c.value.text,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  }
  if (isMobile.value) {
    return pxify({
      ...base,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: '20px 20px 0 0',
      padding: '10px 10px calc(10px + env(safe-area-inset-bottom, 0px))',
      gap: 'var(--sp-1)',
      boxShadow: '0 -12px 40px rgba(0,0,0,0.4)',
      animation: 'sheetUp .28s cubic-bezier(.34,1.56,.64,1)',
    })
  }
  return pxify({
    ...base,
    top: menuPos.value.top,
    left: menuPos.value.left,
    width: 190,
    borderRadius: 'var(--radius-dialog)',
    padding: 6,
    gap: 2,
    boxShadow: '0 14px 34px rgba(0,0,0,0.34)',
    animation: 'sheetUp .2s ease',
  })
})
function menuItemStyle() {
  return pxify({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    width: '100%',
    padding: isMobile.value ? '14px 14px' : '9px 10px',
    borderRadius: 'var(--radius-card)',
    border: 'none',
    background: 'transparent',
    color: c.value.text,
    ...(isMobile.value ? typeStep('base') : typeStep('sm')),
    textAlign: 'left',
    cursor: 'pointer',
  })
}
const menuHover = computed(() => ({ background: c.value.card }))
// A warm red for the destructive action, distinct from the accent so "Stop
// sharing" never blends into the two safe items above it.
const dangerColor = 'oklch(0.66 0.17 25)'
</script>

<template>
  <span ref="wrapEl" :style="wrapStyle">
    <button
      type="button"
      :style="globeStyle"
      :title="tooltip"
      :aria-label="ariaLabel"
      :aria-pressed="isShared"
      :disabled="busy || offline"
      @click="onGlobeClick"
      @keydown="onGlobeKey"
      @contextmenu="onContext"
      @touchstart.passive="onTouchStart"
      @touchend="cancelPress"
      @touchmove="cancelPress"
      @touchcancel="cancelPress"
    >
      <span :key="popKey" :style="iconWrapStyle">
        <!-- Globe: circle + meridian ellipse + latitude line. Filled when ON. -->
        <Icon
          :name="isShared ? 'globe' : 'globe-off'"
          :size="iconStep"
          :style="{ color: isShared ? c.accent : c.dim }"
        />
      </span>
    </button>

    <!-- Caret: keyboard/mouse path to the popover. Long-press and right-click
         reach the same menu; the caret keeps it reachable without either. -->
    <button
      v-if="isShared"
      type="button"
      :style="caretStyle"
      aria-label="Sharing options"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      @click.stop="openMenu"
    >
      <Icon name="chevron-down" size="xs" :style="{ color: c.accent }" />
    </button>
  </span>

  <Teleport to="body">
    <template v-if="menuOpen">
      <div :style="overlayStyle" @click="closeMenu" @contextmenu.prevent="closeMenu"></div>
      <div :style="menuStyle" role="menu">
        <button
          type="button"
          role="menuitem"
          :style="menuItemStyle()"
          v-hover-style="menuHover"
          @click="menuCopy"
        >
          <Icon name="copy" size="sm" :style="{ color: c.text }" />
          <span>Copy link</span>
        </button>
        <button
          type="button"
          role="menuitem"
          :style="menuItemStyle()"
          v-hover-style="menuHover"
          @click="menuOpenLink"
        >
          <Icon name="external-link" size="sm" :style="{ color: c.text }" />
          <span>Open link</span>
        </button>
        <button
          type="button"
          role="menuitem"
          :style="[menuItemStyle(), { color: dangerColor }]"
          v-hover-style="menuHover"
          @click="menuStop"
        >
          <Icon name="globe-off" size="sm" :style="{ color: dangerColor }" />
          <span>Stop sharing</span>
        </button>
      </div>
    </template>
  </Teleport>
</template>
