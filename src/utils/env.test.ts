import { describe, expect, it } from 'vitest'
import { envText, isPlaceholderEnvValue, usableEnvValue } from './env'

describe('env values', () => {
  it('trims values before checking them', () => {
    expect(envText('  project-id  ')).toBe('project-id')
    expect(usableEnvValue('  project-id  ')).toBe('project-id')
  })

  it('treats missing and template values as disabled', () => {
    expect(usableEnvValue(undefined)).toBe('')
    expect(usableEnvValue('')).toBe('')
    expect(usableEnvValue('REPLACE_WITH_FIREBASE_PROJECT_ID')).toBe('')
    expect(usableEnvValue('replace_with_firebase_project_id')).toBe('')
    expect(usableEnvValue('your-firebase-app-id')).toBe('')
    expect(usableEnvValue('<firebase-project-id>')).toBe('')
  })

  it('keeps real-looking service values intact', () => {
    expect(isPlaceholderEnvValue('astra-prod-49c7')).toBe(false)
    expect(usableEnvValue('https://jixmbcrfretemshhnqlm.supabase.co')).toBe(
      'https://jixmbcrfretemshhnqlm.supabase.co',
    )
  })
})
