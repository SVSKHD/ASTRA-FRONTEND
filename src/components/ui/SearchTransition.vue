<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
// One reveal/dissolve lifecycle, including rapid toggles and reduced motion.
const running = new Map<Element, () => void>()
function animate(el: Element, done: () => void, entering: boolean) {
  running.get(el)?.()
  const node = el as HTMLElement
  if (!node.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return done()
  const rect = node.getBoundingClientRect()
  const original = {
    height: node.style.height,
    overflow: node.style.overflow,
    pointerEvents: node.style.pointerEvents,
    inert: node.inert,
  }
  const animations: Animation[] = []
  let dust: HTMLElement | undefined
  let settled = false
  function clear() {
    if (settled) return
    settled = true
    running.delete(el)
    for (const animation of animations) {
      animation.onfinish = null
      animation.cancel()
    }
    dust?.remove()
    Object.assign(node.style, {
      height: original.height,
      overflow: original.overflow,
      pointerEvents: original.pointerEvents,
    })
    node.inert = original.inert
  }
  running.set(el, clear)
  node.style.overflow = 'hidden'
  if (!entering) {
    node.style.pointerEvents = 'none'
    node.inert = true
    dust = document.createElement('div')
    dust.className = 'search-dust'
    dust.setAttribute('aria-hidden', 'true')
    Object.assign(dust.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      pointerEvents: 'none',
      zIndex: '250',
    })
    document.body.append(dust)
    // Deterministic specks drift from the card's right edge as it dissolves.
    for (let i = 0; i < 42; i++) {
      const particle = document.createElement('span')
      const x = ((i * 71) % 101) / 100
      const y = ((i * 37) % 97) / 96
      const size = 2 + (i % 4)
      Object.assign(particle.style, {
        position: 'absolute',
        left: `${x * rect.width}px`,
        top: `${y * rect.height}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: i % 3 ? 'var(--theme-accent)' : 'var(--theme-dim)',
        opacity: '0',
      })
      dust.append(particle)
      animations.push(
        particle.animate(
          [
            { opacity: 0, transform: 'translate(0,0) scale(1)' },
            { opacity: 0.65, transform: 'translate(7px,-3px) scale(1)', offset: 0.2 },
            {
              opacity: 0,
              transform: `translate(${25 + (i % 7) * 8}px,${-16 - (i % 9) * 6}px) scale(.2)`,
            },
          ],
          { duration: 360, delay: (1 - x) * 130, easing: 'ease-out', fill: 'both' },
        ),
      )
    }
  }
  const height = `${rect.height || node.scrollHeight}px`
  const animation = node.animate(
    entering
      ? [
          {
            height: '0px',
            opacity: 0,
            transform: 'translateY(-10px) scale(.97)',
            filter: 'blur(5px)',
          },
          { height, opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        ]
      : [
          {
            height,
            opacity: 1,
            clipPath: 'inset(0 0 0 0)',
            filter: 'blur(0)',
            transform: 'translateY(0)',
          },
          {
            height,
            opacity: 0.35,
            clipPath: 'inset(0 75% 0 0)',
            filter: 'blur(3px)',
            transform: 'translateY(-3px)',
            offset: 0.58,
          },
          {
            height: '0px',
            opacity: 0,
            clipPath: 'inset(0 100% 0 0)',
            filter: 'blur(5px)',
            transform: 'translateY(-8px)',
          },
        ],
    {
      duration: entering ? 360 : 520,
      easing: entering ? 'cubic-bezier(.2,.8,.2,1)' : 'cubic-bezier(.4,0,.2,1)',
      fill: 'both',
    },
  )
  animations.push(animation)
  animation.onfinish = () => {
    clear()
    done()
  }
}
const enter = (el: Element, done: () => void) => animate(el, done, true)
const leave = (el: Element, done: () => void) => animate(el, done, false)
const cancel = (el: Element) => running.get(el)?.()
onBeforeUnmount(() => {
  for (const clear of [...running.values()]) clear()
})
</script>
<template>
  <Transition
    :css="false"
    @enter="enter"
    @leave="leave"
    @enter-cancelled="cancel"
    @leave-cancelled="cancel"
    ><slot
  /></Transition>
</template>
