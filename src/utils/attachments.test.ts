// Section 27b — what may be attached, decided without a network.
import { describe, expect, it } from 'vitest'
import {
  ACCEPT_ATTR,
  attachmentPath,
  formatBytes,
  isImage,
  MAX_BYTES,
  MAX_PER_TXN,
  rejectReason,
  safeName,
  triageFiles,
} from '@/utils/attachments'

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) =>
  ({ name: 'receipt.jpg', type: 'image/jpeg', size: 120_000, ...over }) as File

describe('what is allowed', () => {
  it('takes a photo and a PDF', () => {
    expect(rejectReason(file())).toBeNull()
    expect(rejectReason(file({ name: 'statement.pdf', type: 'application/pdf' }))).toBeNull()
  })

  it('turns away anything else, in a sentence', () => {
    // A code would be translated back into this sentence at the one place it is
    // shown, so it is written here.
    expect(rejectReason(file({ type: 'application/zip' }))).toBe(
      'Only images and PDFs can be attached.',
    )
  })

  it('turns away a file over the limit, and says how far over', () => {
    const reason = rejectReason(file({ size: MAX_BYTES + 1 }))
    expect(reason).toContain('8.0 MB')
    expect(reason).toContain('Too large')
  })

  it('turns away an empty file', () => {
    // A zero-byte upload produces an attachment that silently shows nothing
    // when opened, which reads as a bug rather than as a bad file.
    expect(rejectReason(file({ size: 0 }))).toBe('That file is empty.')
  })

  it('offers the same list to the file picker', () => {
    expect(ACCEPT_ATTR).toContain('image/jpeg')
    expect(ACCEPT_ATTR).toContain('application/pdf')
  })
})

describe('a multi-file selection', () => {
  it('uploads what it can and says why the rest did not', () => {
    // Partial success on purpose: four receipts and a screenshot should upload
    // the four, not refuse the lot and make the user pick again.
    const { accepted, rejected } = triageFiles([
      file({ name: 'a.jpg' }),
      file({ name: 'b.zip', type: 'application/zip' }),
      file({ name: 'c.png', type: 'image/png' }),
    ])
    expect(accepted.map((f) => f.name)).toEqual(['a.jpg', 'c.png'])
    expect(rejected).toEqual([{ name: 'b.zip', reason: 'Only images and PDFs can be attached.' }])
  })

  it('stops at the per-transaction cap', () => {
    const many = Array.from({ length: 6 }, (_, i) => file({ name: `${i}.jpg` }))
    const { accepted, rejected } = triageFiles(many)
    expect(accepted).toHaveLength(MAX_PER_TXN)
    expect(rejected).toHaveLength(6 - MAX_PER_TXN)
    expect(rejected[0].reason).toContain('per transaction')
  })

  it('counts what is already attached against the cap', () => {
    const { accepted } = triageFiles([file(), file(), file()], MAX_PER_TXN - 1)
    expect(accepted).toHaveLength(1)
  })

  it('handles an empty selection', () => {
    expect(triageFiles([])).toEqual({ accepted: [], rejected: [] })
  })
})

describe('the storage key', () => {
  it('scopes by uid first, so the rule is a path match', () => {
    expect(attachmentPath('u1', 42, 'abc', 'receipt.jpg')).toBe(
      'users/u1/finance/42/abc-receipt.jpg',
    )
  })

  it('does not let a filename escape its prefix', () => {
    // A slash in a name would climb out of the uid-scoped prefix the security
    // rule matches on, which turns a filename into a path traversal.
    const path = attachmentPath('u1', 42, 'abc', '../../other/secret.jpg')
    expect(path.startsWith('users/u1/finance/42/')).toBe(true)
    // The name collapses to a single flat segment. That — not the absence of
    // the characters — is what makes traversal impossible: a Storage key is a
    // flat string in which `..` carries no meaning, and the danger was only
    // ever the separator.
    expect(path.split('/')).toHaveLength(5)
    expect(path).not.toContain('/other/')
  })

  it('strips control characters rather than writing them into a key', () => {
    // The section 26 lesson: a control character in a stored string is invisible
    // in every console that later shows it, and makes the file binary to grep.
    expect(safeName('re\u0007ceipt.jpg')).toBe('receipt.jpg')
    expect(safeName('a\u0000b')).toBe('ab')
    expect(safeName('a\u007fb')).toBe('ab')
  })

  it('keeps punctuation that is merely punctuation', () => {
    // The trap this guards: `[\x00-\x1f]` written as a literal range of
    // characters rather than as escapes reads like "space or hyphen" and is in
    // fact the range 0x20–0x2D, which silently eats every mark between them.
    expect(safeName('receipt (1).jpg')).toBe('receipt-(1).jpg')
    expect(safeName('bill_march+april.pdf')).toBe('bill_march+april.pdf')
    expect(safeName('receipt,final.pdf')).toBe('receipt,final.pdf')
  })

  it('never produces an empty segment', () => {
    expect(safeName('')).toBe('file')
    expect(safeName('///')).toBe('file')
    expect(safeName(' ')).toBe('file')
  })

  it('bounds a pathological name', () => {
    expect(safeName('x'.repeat(500))).toHaveLength(80)
  })

  it('gives two files of the same name different keys', () => {
    // A camera roll produces IMG_0001.jpg over and over. Without the random id
    // the second receipt silently overwrites the first.
    const a = attachmentPath('u1', 42, 'id-a', 'IMG_0001.jpg')
    const b = attachmentPath('u1', 42, 'id-b', 'IMG_0001.jpg')
    expect(a).not.toBe(b)
  })
})

describe('presentation helpers', () => {
  it('formats bytes the way a person reads them', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(120_000)).toBe('117 KB')
    expect(formatBytes(2_500_000)).toBe('2.4 MB')
    expect(formatBytes(-1)).toBe('0 KB')
    expect(formatBytes(NaN)).toBe('0 KB')
  })

  it('knows which attachments can show a thumbnail', () => {
    expect(isImage('image/png')).toBe(true)
    expect(isImage('application/pdf')).toBe(false)
  })
})
