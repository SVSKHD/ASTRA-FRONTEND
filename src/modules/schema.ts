// JSON Schema → form fields, validation and the request body, for the generic
// form view; and how a cell is shown in the generic list and detail views.
//
// Secrets are never DISPLAYED: a column or field whose name or schema says
// secret (the same rule as the backend's app/services/ui_manifest.py) is
// dropped, whatever the manifest says. A form may still ASK for one — as a
// password input that is cleared after sending.

import { when } from '@/trading/format'
import type { ManifestColumn } from './manifest'

const SECRET_WORDS = new Set([
  'password', 'passwd', 'passcode', 'passphrase', 'secret', 'secrets', 'token', 'tokens',
  'apikey', 'credential', 'credentials', 'cookie', 'cookies', 'otp', 'totp', 'pin',
  'signature', 'hash', 'salt', 'mfa',
]) // prettier-ignore
const SECRET_PAIRS = new Set(['api key', 'private key', 'access key', 'secret key'])

type Schema = Record<string, unknown>

export function isSecret(name: string, schema?: Schema | null): boolean {
  if (
    schema &&
    (schema.writeOnly === true || schema.format === 'password' || schema.format === 'secret')
  )
    return true
  const parts = name
    .split(/[_\-\s.]+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map((p) => p.toLowerCase())
  if (parts.some((p) => SECRET_WORDS.has(p))) return true
  return parts.some((p, i) => i + 1 < parts.length && SECRET_PAIRS.has(`${p} ${parts[i + 1]}`))
}

/** The columns safe to show. */
export function safeColumns(columns: ManifestColumn[] | undefined): ManifestColumn[] {
  return (columns ?? []).filter((c) => c && c.key && !isSecret(c.key))
}

export function cell(value: unknown, column: Pick<ManifestColumn, 'key' | 'format'>): string {
  if (isSecret(column.key)) return '••••'
  if (value === null || value === undefined || value === '') return '—'
  switch (column.format) {
    case 'datetime':
      return typeof value === 'string' ? when(value) : String(value)
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') {
    const text = JSON.stringify(value)
    return text.length > 80 ? `${text.slice(0, 77)}…` : text
  }
  return String(value)
}

// ---- forms -------------------------------------------------------------------

export type FieldType =
  'string' | 'text' | 'number' | 'integer' | 'boolean' | 'enum' | 'secret' | 'json'

export interface FormField {
  name: string
  label: string
  type: FieldType
  required: boolean
  description?: string
  options?: { value: string; label: string }[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  default?: unknown
}

/** `{type: X}` or `anyOf: [X, {type: null}]` → X. */
function core(schema: Schema): Schema {
  for (const key of ['anyOf', 'oneOf'] as const) {
    const alts = schema[key]
    if (Array.isArray(alts)) {
      const real = alts.find((a) => a && typeof a === 'object' && (a as Schema).type !== 'null')
      if (real) return { ...(real as Schema), ...schema, [key]: undefined }
    }
  }
  return schema
}

export function fieldsOf(schema: Schema | null | undefined): FormField[] {
  if (!schema || typeof schema !== 'object') return []
  const props = (schema.properties ?? {}) as Record<string, Schema>
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : [])
  return Object.entries(props)
    .filter(([, p]) => p && typeof p === 'object' && p.readOnly !== true)
    .map(([name, raw]) => {
      const p = core(raw)
      const base = {
        name,
        label:
          typeof p.title === 'string'
            ? p.title
            : name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        required: required.has(name),
        description: typeof p.description === 'string' ? p.description : undefined,
        default: p.default,
      }
      if (isSecret(name, p))
        return { ...base, type: 'secret' as const, maxLength: p.maxLength as number | undefined }
      if (Array.isArray(p.enum)) {
        return {
          ...base,
          type: 'enum' as const,
          options: (p.enum as unknown[]).map((v) => ({ value: String(v), label: String(v) })),
        }
      }
      switch (p.type) {
        case 'boolean':
          return { ...base, type: 'boolean' as const }
        case 'integer':
        case 'number':
          return {
            ...base,
            type: p.type,
            minimum: (p.minimum ?? p.exclusiveMinimum) as number | undefined,
            maximum: (p.maximum ?? p.exclusiveMaximum) as number | undefined,
          }
        case 'string': {
          const maxLength = p.maxLength as number | undefined
          return {
            ...base,
            type: maxLength && maxLength > 200 ? ('text' as const) : ('string' as const),
            minLength: p.minLength as number | undefined,
            maxLength,
            pattern: typeof p.pattern === 'string' ? p.pattern : undefined,
          }
        }
        default:
          return { ...base, type: 'json' as const }
      }
    })
}

export type FormValues = Record<string, unknown>

export function initialValues(fields: FormField[]): FormValues {
  const out: FormValues = {}
  for (const f of fields) {
    if (f.default !== undefined && f.type !== 'secret')
      out[f.name] = f.type === 'json' ? JSON.stringify(f.default) : f.default
    else
      out[f.name] =
        f.type === 'boolean' ? false : f.type === 'number' || f.type === 'integer' ? null : ''
  }
  return out
}

/** Field name → what is wrong, in words. Empty when the form may be sent. */
export function validate(fields: FormField[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const v = values[f.name]
    const empty = v === '' || v === null || v === undefined
    if (empty) {
      if (f.required && f.type !== 'boolean') errors[f.name] = 'Required.'
      continue
    }
    if (f.type === 'number' || f.type === 'integer') {
      const n = Number(v)
      if (!Number.isFinite(n)) errors[f.name] = 'Enter a number.'
      else if (f.type === 'integer' && !Number.isInteger(n))
        errors[f.name] = 'Enter a whole number.'
      else if (f.minimum !== undefined && n < f.minimum) errors[f.name] = `At least ${f.minimum}.`
      else if (f.maximum !== undefined && n > f.maximum) errors[f.name] = `At most ${f.maximum}.`
    } else if (f.type === 'json') {
      try {
        JSON.parse(String(v))
      } catch {
        errors[f.name] = 'Enter valid JSON.'
      }
    } else if (typeof v === 'string') {
      if (f.minLength !== undefined && v.length < f.minLength)
        errors[f.name] = `At least ${f.minLength} characters.`
      else if (f.maxLength !== undefined && v.length > f.maxLength)
        errors[f.name] = `At most ${f.maxLength} characters.`
      else if (f.pattern) {
        try {
          if (!new RegExp(f.pattern, 'u').test(v)) errors[f.name] = 'Not in the expected format.'
        } catch {
          /* a pattern JS cannot read is the server's to check */
        }
      }
    }
  }
  return errors
}

/** The JSON body: typed values, empty optional fields left out. */
export function bodyOf(fields: FormField[], values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = values[f.name]
    if (v === '' || v === null || v === undefined) continue
    if (f.type === 'number' || f.type === 'integer') out[f.name] = Number(v)
    else if (f.type === 'json') out[f.name] = JSON.parse(String(v))
    else out[f.name] = v
  }
  return out
}
