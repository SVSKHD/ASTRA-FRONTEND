export function envText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

export function isPlaceholderEnvValue(value: unknown): boolean {
  const text = envText(value)
  if (!text) return true

  const lower = text.toLowerCase()
  if (lower === 'undefined' || lower === 'null') return true
  if (lower.includes('replace_with') || lower.includes('replace-with')) return true
  if (lower.startsWith('your_') || lower.startsWith('your-')) return true
  if (/^<[^>]+>$/.test(text)) return true

  return false
}

export function usableEnvValue(value: unknown): string {
  const text = envText(value)
  return isPlaceholderEnvValue(text) ? '' : text
}
