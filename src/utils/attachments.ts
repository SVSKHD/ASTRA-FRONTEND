// Receipt attachments (section 27b): the rules, without the network.
//
// Kept separate from the upload itself so the two things that actually reject a
// file — what it is, and how big it is — are testable without Firebase, a
// browser, or a file picker. They are also the two things a user hits, so their
// messages are written here rather than assembled at a call site.

/** What a phone camera and a bank statement produce, and nothing else. */
export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const

/** The `accept` attribute for the file input, from the same list. */
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(',')

/**
 * 8MB. A photographed receipt is well under 1MB; 8 leaves room for a
 * multi-page PDF statement without letting a 40MB burst-mode original through.
 */
export const MAX_BYTES = 8 * 1024 * 1024

export const MAX_PER_TXN = 4

export interface Attachment {
  id: string
  name: string
  contentType: string
  size: number
  /** A download URL. Firebase tokens these, so it is not a public path. */
  url: string
  uploadedAt: number
}

export interface RejectedFile {
  name: string
  reason: string
}

/** Human bytes. Used in the rejection message, so it has to read like one. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/**
 * Why this file cannot be attached, or null.
 *
 * Returns a sentence rather than a code, because there is exactly one place it
 * is shown and a code would be translated back into this sentence there.
 */
export function rejectReason(file: { name: string; type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return 'Only images and PDFs can be attached.'
  }
  if (file.size > MAX_BYTES) {
    return `Too large — ${formatBytes(file.size)}, and the limit is ${formatBytes(MAX_BYTES)}.`
  }
  // A zero-byte file is a failed read or an empty placeholder, and uploading it
  // produces an attachment that silently shows nothing when opened.
  if (file.size === 0) return 'That file is empty.'
  return null
}

export interface Triage {
  accepted: File[]
  rejected: RejectedFile[]
}

/**
 * Split a selection into what will upload and what will not.
 *
 * Partial success on purpose: picking four receipts and one screenshot should
 * upload the four and say why the fifth did not, rather than refusing the lot
 * and making the user pick again more carefully.
 */
export function triageFiles(files: File[], alreadyAttached = 0): Triage {
  const accepted: File[] = []
  const rejected: RejectedFile[] = []
  for (const file of files) {
    const reason = rejectReason(file)
    if (reason) {
      rejected.push({ name: file.name, reason })
    } else if (accepted.length + alreadyAttached >= MAX_PER_TXN) {
      rejected.push({ name: file.name, reason: `Only ${MAX_PER_TXN} files per transaction.` })
    } else {
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}

/**
 * The storage path for an attachment.
 *
 * Scoped by uid as the first segment so the security rule is a path match
 * rather than a metadata lookup, and suffixed with a random id so two receipts
 * both named IMG_0001.jpg do not overwrite each other — which, with a file
 * picker defaulting to a camera roll, is the common case rather than the edge.
 */
export function attachmentPath(uid: string, txnId: number, id: string, name: string): string {
  return `users/${uid}/finance/${txnId}/${id}-${safeName(name)}`
}

/**
 * A filename safe for a storage key.
 *
 * Slashes go first and for a reason: a name containing one would escape the
 * uid-scoped prefix the security rule matches on, which turns a filename into a
 * path traversal. Control characters go too — they are invisible in every
 * console that would later show the key — and the result is bounded so a
 * pathological name cannot exceed the key limit.
 */
export function safeName(name: string): string {
  const cleaned = (name || 'file')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return (cleaned || 'file').slice(0, 80)
}

/** Whether a thumbnail can be drawn, or only a file chip. */
export function isImage(contentType: string): boolean {
  return contentType.startsWith('image/')
}
