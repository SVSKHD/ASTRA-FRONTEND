import type { Directive } from 'vue'

// v-hover-style: apply extra inline styles while the pointer is over the
// element, mirroring the design's `style-hover` attribute. Hover style values
// here are all plain strings (transform, box-shadow, background), so they can be
// assigned directly to element.style.
type HoverEl = HTMLElement & {
  __hoverStyle?: Record<string, string>
  __enter?: () => void
  __leave?: () => void
  __snapshot?: string
}

export const vHoverStyle: Directive<HoverEl, Record<string, string> | undefined> = {
  mounted(el, binding) {
    el.__hoverStyle = binding.value || {}
    el.__enter = () => {
      el.__snapshot = el.getAttribute('style') || ''
      const hs = el.__hoverStyle || {}
      for (const k in hs) el.style.setProperty(camelToKebab(k), hs[k])
    }
    el.__leave = () => {
      el.setAttribute('style', el.__snapshot || '')
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
