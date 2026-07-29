// Copy text to the clipboard, resolving to whether it actually landed.
//
// The async Clipboard API is the happy path, but it is only available in a
// secure context (https / localhost) and can be denied by permissions. Share
// links are copied the instant a globe is toggled on, and that can happen on a
// plain-http preview build or an embedded webview, so a fallback matters: a
// hidden textarea plus execCommand('copy') still works where the API is absent.
// The caller uses the boolean to decide between a "Link copied" toast and a
// "copy failed" hint, rather than pretending success it cannot confirm.

function fallbackCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  // Keep it off-screen and unfocusable-looking while still selectable.
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  try {
    ta.select()
    ta.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or insecure context — fall through to execCommand.
    }
  }
  return fallbackCopy(text)
}
