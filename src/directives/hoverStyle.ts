import type { Directive } from 'vue'

// v-hover-style: apply extra inline styles while the pointer is over the
// element, mirroring the design's `style-hover` attribute. Hover style values
// here are all plain strings (transform, box-shadow, background), so they can be
// assigned directly to element.style.
//
// On leave it restores ONLY the properties it set, to the values they had when
// the pointer arrived. It used to write the whole `style` attribute back from a
// snapshot, which silently undid anything Vue had patched while the pointer was
// over the row (selecting it, ticking it, a drag highlight) — the row flickered
// back to a stale look and then jumped again on the next render.
type HoverEl = HTMLElement & {
  __hoverStyle?: Record<string, string>
  __enter?: () => void
  __leave?: () => void
  __prev?: Record<string, string>
}

export const vHoverStyle: Directive<HoverEl, Record<string, string> | undefined> = {
  mounted(el, binding) {
    el.__hoverStyle = binding.value || {}
    el.__enter = () => {
      const hs = el.__hoverStyle || {}
      const prev: Record<string, string> = {}
      for (const k in hs) {
        const prop = camelToKebab(k)
        prev[prop] = el.style.getPropertyValue(prop)
        el.style.setProperty(prop, hs[k])
      }
      el.__prev = prev
    }
    el.__leave = () => {
      const prev = el.__prev || {}
      for (const prop in prev) {
        if (prev[prop]) el.style.setProperty(prop, prev[prop])
        else el.style.removeProperty(prop)
      }
      el.__prev = undefined
    }
    el.addEventListener('mouseenter', el.__enter)
    el.addEventListener('mouseleave', el.__leave)
  },
  updated(el, binding) {
    el.__hoverStyle = binding.value || {}
  },
  beforeUnmount(el) {
    if (el.__enter) el.removeEventListener('mouseenter', el.__enter)
    if (el.__leave) el.removeEventListener('mouseleave', el.__leave)
  },
}

function camelToKebab(k: string): string {
  if (k.startsWith('-')) return k
  return k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}
