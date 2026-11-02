// The service worker serves the offline shell only. It never caches an API
// answer and never answers an API navigation with the shell (D-21-6).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const config = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8')
const runtime = config.slice(config.indexOf('runtimeCaching: ['))

describe('the service worker and the API', () => {
  it('routes every /api/ request network-only, before any caching rule', () => {
    expect(config).toMatch(/const API_PATH = \/\^\\\/api\\\/\//)
    const first = runtime.indexOf('handler:')
    expect(runtime.slice(0, first)).toContain('API_PATH.test(url.pathname)')
    expect(runtime.slice(first, first + 40)).toContain("'NetworkOnly'")
  })

  it('keeps API navigations off the offline shell', () => {
    expect(config).toMatch(/navigateFallbackDenylist: \[API_PATH\]/)
  })

  it('has an installable manifest with the control center as a shortcut', () => {
    expect(config).toContain("display: 'standalone'")
    expect(config).toContain("url: '/dev'")
    expect(config).toContain('theme_color: THEMES.deepSpace.bgSolid')
  })
})
