// Moving a note from the old HTML storage to markdown (section 17).
//
// There is no bulk migration pass. A note converts the first time it is opened
// in the editor, and is written back as markdown from that point on — so the
// workspace moves over as it is used, nothing is rewritten behind the user's
// back, and a note nobody touches keeps rendering exactly as it always did.
//
// Turndown is the same converter the paste path uses and is loaded the same way:
// on demand, never with the editor.

import { isHtmlNote } from '@/utils/notes'
import { normalizeMarkdown } from '@/utils/mdPaste'
import type TurndownService from 'turndown'

let load: Promise<TurndownService | null> | null = null

async function converter(): Promise<TurndownService | null> {
  if (!load) {
    load = import('turndown')
      .then((mod) => {
        const service = new mod.default({
          headingStyle: 'atx',
          hr: '---',
          bulletListMarker: '-',
          codeBlockStyle: 'fenced',
          emDelimiter: '_',
          strongDelimiter: '**',
        })
        // The old editor wrote real checkbox inputs for its checklists; they
        // become task-list syntax rather than being dropped as unknown markup.
        service.addRule('checkboxItem', {
          filter: (node: HTMLElement) =>
            node.nodeName === 'LI' && !!node.querySelector('input[type="checkbox"]'),
          replacement: (content: string, node: Node) => {
            const box = (node as HTMLElement).querySelector('input[type="checkbox"]')
            const done = box?.hasAttribute('checked') || (box as HTMLInputElement | null)?.checked
            return `- [${done ? 'x' : ' '}] ${content.trim()}\n`
          },
        })
        service.addRule('dropCheckboxes', {
          filter: (node: HTMLElement) =>
            node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox',
          replacement: () => '',
        })
        service.addRule('strikethrough', {
          filter: ['del', 's'],
          replacement: (content: string) => `~~${content}~~`,
        })
        return service
      })
      .catch(() => null)
  }
  return load
}

// The markdown for a stored note. Already-markdown notes come back untouched —
// including their whitespace, so opening and closing a note without editing it
// never marks it dirty.
export async function toMarkdown(text: string): Promise<string> {
  if (!isHtmlNote(text)) return text || ''
  const service = await converter()
  if (!service) return text || ''
  try {
    return normalizeMarkdown(service.turndown(text))
  } catch {
    // A conversion that throws leaves the note as it was rather than losing it.
    return text || ''
  }
}
