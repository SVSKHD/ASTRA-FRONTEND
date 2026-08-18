// Progressive rendering for very long notes (section 17).
//
// A 200KB note parsed and mounted in one go blocks the frame that opens it. The
// fix is not to parse less markdown — it is to mount less DOM: the note is cut
// at a block boundary near the threshold, the first part renders immediately,
// and the rest arrives when the reader asks for it.
//
// Cutting at a *block* boundary is the whole point. Splitting at a byte offset
// could land inside a fence or a table and the first half would render as
// garbage; this walks blocks and never cuts one in two.

// Notes under this render whole. Chosen to sit above anything typed by hand and
// below the pasted-a-whole-document case the control exists for.
export const PROGRESSIVE_THRESHOLD = 50_000

export interface Progressive {
  // The part to render now.
  head: string
  // The part held back. Empty when the note renders whole.
  rest: string
  // True when the note was cut.
  truncated: boolean
}

// Block boundaries are blank lines, except inside a fence where a blank line is
// just a blank line of code.
export function splitBlocks(source: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  for (const line of (source || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && !line.trim()) {
      if (current.length) {
        blocks.push(current.join('\n'))
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length) blocks.push(current.join('\n'))
  return blocks
}

export function progressive(source: string, limit = PROGRESSIVE_THRESHOLD): Progressive {
  const text = source || ''
  if (text.length <= limit) return { head: text, rest: '', truncated: false }

  const blocks = splitBlocks(text)
  const head: string[] = []
  let size = 0
  let index = 0
  for (; index < blocks.length; index++) {
    // Always take at least one block, however large it is — half a fence is
    // worse than a slow one.
    if (head.length && size + blocks[index].length > limit) break
    head.push(blocks[index])
    size += blocks[index].length + 2
  }
  if (index >= blocks.length) return { head: text, rest: '', truncated: false }
  return {
    head: head.join('\n\n'),
    rest: blocks.slice(index).join('\n\n'),
    truncated: true,
  }
}

// A rough count of what is being held back, for the control's label. Blocks
// rather than bytes, because "12 more blocks" means something and "38KB" does
// not.
export function blockCount(source: string): number {
  return splitBlocks(source).length
}
