import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '@/utils/clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else setClipboard(undefined)
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('returns false for empty text without touching the clipboard', async () => {
    const writeText = vi.fn()
    setClipboard({ writeText })
    expect(await copyText('')).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('https://example.test/share')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.test/share')
  })

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('insecure context'))
    setClipboard({ writeText })
    const exec = vi.fn().mockReturnValue(true)
    // jsdom does not implement execCommand; define it for the fallback path.
    ;(document as unknown as { execCommand: unknown }).execCommand = exec
    expect(await copyText('link')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('falls back when there is no Clipboard API at all', async () => {
    setClipboard(undefined)
    const exec = vi.fn().mockReturnValue(true)
    ;(document as unknown as { execCommand: unknown }).execCommand = exec
    expect(await copyText('link')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })
})
