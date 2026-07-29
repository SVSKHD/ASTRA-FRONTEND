import { describe, it, expect } from 'vitest'
import { SLASH_COMMANDS, MARKDOWN_SHORTCUTS, filterCommands } from './editorCommands'

describe('SLASH_COMMANDS', () => {
  it('covers exactly the ten documented block commands', () => {
    expect(SLASH_COMMANDS.map((c) => c.id)).toEqual([
      'heading1',
      'heading2',
      'heading3',
      'paragraph',
      'bullet',
      'numbered',
      'todo',
      'quote',
      'divider',
      'code',
    ])
  })

  it('gives every command an example that starts with a slash and a preview', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.example.startsWith('/')).toBe(true)
      expect(cmd.preview.length).toBeGreaterThan(0)
      expect(cmd.hint.length).toBeGreaterThan(0)
    }
  })
})

describe('filterCommands', () => {
  it('returns everything for an empty query', () => {
    expect(filterCommands('')).toHaveLength(SLASH_COMMANDS.length)
    expect(filterCommands('   ')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('surfaces every heading for a heading-ish query', () => {
    expect(filterCommands('head').map((c) => c.id)).toEqual(['heading1', 'heading2', 'heading3'])
    // A shorter "h" still includes the headings (it may also catch others via
    // substring, e.g. divider's "hr" keyword — that is intended).
    const short = filterCommands('h').map((c) => c.id)
    expect(short).toEqual(expect.arrayContaining(['heading1', 'heading2', 'heading3']))
  })

  it('matches on keywords, not just the label', () => {
    // 'checkbox' is a keyword of /todo, not part of its label.
    expect(filterCommands('checkbox').map((c) => c.id)).toEqual(['todo'])
    // 'dash' is a keyword of /bullet (markdown "- ").
    expect(filterCommands('dash').map((c) => c.id)).toContain('bullet')
  })

  it('returns nothing for an unknown query', () => {
    expect(filterCommands('zzzz')).toHaveLength(0)
  })
})

describe('MARKDOWN_SHORTCUTS', () => {
  it('documents the line-start and inline shortcuts', () => {
    const syntaxes = MARKDOWN_SHORTCUTS.map((m) => m.syntax)
    expect(syntaxes).toContain('# ')
    expect(syntaxes).toContain('- ')
    expect(syntaxes).toContain('1. ')
    expect(syntaxes).toContain('> ')
    expect(syntaxes).toContain('**bold**')
    expect(syntaxes).toContain('`code`')
  })
})
