import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyAsMarkdown,
  copyAsRichText,
  downloadMarkdown,
  exportFilename,
} from '@/utils/noteExport'

const writeText = vi.fn().mockResolvedValue(undefined)
const write = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  write.mockClear()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText, write },
    configurable: true,
  })
})

describe('copying', () => {
  it('copies the markdown source verbatim', async () => {
    await copyAsMarkdown('# Title\n\n- a')
    expect(writeText).toHaveBeenCalledWith('# Title\n\n- a')
  })

  it('copies rich text as both flavours, so the receiving app can choose', async () => {
    class FakeItem {
      constructor(public parts: Record<string, Blob>) {}
    }
    vi.stubGlobal('ClipboardItem', FakeItem)
    await copyAsRichText('# Title')
    expect(write).toHaveBeenCalledTimes(1)
    const item = write.mock.calls[0][0][0] as FakeItem
    expect(Object.keys(item.parts).sort()).toEqual(['text/html', 'text/plain'])
    vi.unstubAllGlobals()
  })

  it('falls back to the source where two flavours are not supported', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    await copyAsRichText('# Title')
    expect(write).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith('# Title')
    vi.unstubAllGlobals()
  })

  it('reports failure rather than throwing when the clipboard is denied', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    expect(await copyAsMarkdown('x')).toBe(false)
  })
})

describe('the export filename', () => {
  it("comes from the note's first line", () => {
    expect(exportFilename('# Quarter plan\n\nbody')).toBe('quarter-plan.md')
  })

  it('drops punctuation and collapses spaces', () => {
    expect(exportFilename('## Q3: the *big* one!')).toBe('q3-the-big-one.md')
  })

  it('falls back for a note with no usable title', () => {
    expect(exportFilename('★★★')).toBe('note.md')
    expect(exportFilename('')).toBe('untitled-note.md')
  })
})

describe('the download', () => {
  it('writes a markdown blob, clicks a link for it, and releases the URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const url = downloadMarkdown('# Title')
    expect(url).toBe('blob:x')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect((createObjectURL.mock.calls[0] as unknown as Blob[])[0].type).toContain('text/markdown')
    expect(click).toHaveBeenCalled()
    // The link does not linger in the document.
    expect(document.querySelector('a[download]')).toBe(null)

    click.mockRestore()
    // Let the deferred revoke run while the stub is still in place.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
    vi.unstubAllGlobals()
  })
})
