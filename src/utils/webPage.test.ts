import { describe, expect, it } from 'vitest'
import { isPrivateHost, linksIn, pageText } from '@/utils/webPage'

describe('linksIn', () => {
  it('finds links once each, without trailing punctuation', () => {
    expect(
      linksIn(
        'See https://example.com/event?id=4. Also (https://a.io/x), and https://example.com/event?id=4!',
      ),
    ).toEqual(['https://example.com/event?id=4', 'https://a.io/x'])
  })
  it('stops at the limit', () => {
    expect(linksIn('https://a.io https://b.io https://c.io https://d.io', 2)).toHaveLength(2)
  })
})

describe('isPrivateHost', () => {
  it('refuses localhost, bare names and private or metadata addresses', () => {
    for (const h of [
      'localhost',
      'intranet',
      'printer.local',
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '[::1]',
      'fd00::1',
      '::ffff:10.0.0.1',
    ])
      expect(isPrivateHost(h), h).toBe(true)
  })
  it('allows ordinary public hosts', () => {
    for (const h of ['example.com', 'www.bbc.co.uk', '8.8.8.8', '172.32.0.1', '2606:4700::1111'])
      expect(isPrivateHost(h), h).toBe(false)
  })
})

describe('pageText', () => {
  it('keeps the title and readable text, and drops scripts and navigation', () => {
    const html = `<html><head><title>Run  Club &amp; Co</title>
      <meta name="description" content="Saturday 10k, 7am start"></head>
      <body><nav>Home | About</nav><script>track()</script>
      <h1>Spring 10k</h1><p>Starts at 7&nbsp;am.</p><ul><li>Bring water</li><li>Arrive early</li></ul>
      <footer>© 2026</footer></body></html>`
    const out = pageText(html, 'text/html; charset=utf-8')
    expect(out.title).toBe('Run Club & Co')
    expect(out.text).toContain('Saturday 10k, 7am start')
    expect(out.text).toContain('Spring 10k\nStarts at 7 am.')
    expect(out.text).toContain('- Bring water')
    expect(out.text).not.toMatch(/track\(\)|Home \| About|© 2026/)
  })
  it('passes plain text through, cut to size', () => {
    expect(pageText('a'.repeat(50), 'text/plain', 10).text).toBe('a'.repeat(10))
  })
})
