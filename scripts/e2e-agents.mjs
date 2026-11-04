// End-to-end: the News, Voice and Image agents' screens on a phone-sized page.
//
//   npm run e2e:agents                                   # starts its own fixture dev server
//   node scripts/e2e-agents.mjs --base http://localhost:5173
//
// Offline: the dev server runs with VITE_FIXTURE=1 and no API proxy, and EVERY
// /api request is answered here (page.route), so nothing reaches a real Aureon.
// Three flows:
//
//   1. News filter  — /dev/shot/news: a symbol search narrows the cards; a new
//                     headline waits behind the "N new" pill until tapped.
//   2. Voice        — the global mic with the browser's recogniser replaced by a
//                     fake that "hears" a scripted phrase (mocked audio): "open
//                     the news" navigates; "approve request 12" is refused as
//                     read-only and opens the approval instead.
//   3. Image job    — /images: generate → queued (ETA estimate) → running 50%
//                     → done → in the gallery → full view with Download →
//                     delete; then a second job is cancelled.
//
// Exit code 0 only when every step passes.

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = Number(flag('port', '5183'))
const EXTERNAL = flag('base', '')
const BASE = EXTERNAL || `http://127.0.0.1:${PORT}`

async function startServer() {
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    {
      // AUREON_DEV_PROXY emptied: a developer's .env may point /api at production.
      env: { ...process.env, VITE_FIXTURE: '1', BROWSER: 'none', AUREON_DEV_PROXY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) return child
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) break
    await sleep(500)
  }
  child.kill('SIGTERM')
  throw new Error(`dev server did not start on ${BASE}\n${log.slice(-2000)}`)
}

// ---- the mocked Aureon ------------------------------------------------------

const ADMIN = { id: 'u1', email: 'owner@example.test', role: 'admin', is_active: true }
const doc = (id, title, source, published) => ({
  doc_id: id,
  data: { title, link: `https://news.example.test/${id}`, published, source },
  updated_at: published,
})
// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function mockAureon(state) {
  return async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    const m = req.method()
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    state.calls.push(`${m} ${p}`)

    if (p === '/api/auth/me') return json(ADMIN)
    if (p === '/api/public/forex') return json(state.news)
    if (p === '/api/v1/voice/intent' && m === 'POST') {
      const { transcript } = req.postDataJSON()
      const n = /(\d+)/.exec(transcript)?.[1]
      return json({
        intent: 'open_approval',
        route: n ? `/dev/approvals/${n}` : null,
        params: n ? { ref: n } : {},
        source: 'grammar',
        note: 'navigation only: review and act in the app',
      })
    }
    if (p === '/api/images/generate' && m === 'POST') {
      const body = req.postDataJSON()
      state.job = {
        id: `job-${++state.jobs}`,
        status: 'queued',
        progress: 0,
        cancel_requested: false,
        queue_position: 1,
        prompt: body.prompt,
        negative_prompt: body.negative_prompt,
        seed: body.seed ?? 42,
        steps: body.steps ?? 25,
        width: 512,
        height: 512,
        model: 'sd15',
        error: null,
        attempts: 1,
        asset_id: null,
        created_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
      }
      state.reads = 0
      return json(state.job, 202)
    }
    const jobMatch = /^\/api\/images\/jobs\/([^/]+)(\/cancel)?$/.exec(p)
    if (jobMatch && state.job) {
      const j = state.job
      if (jobMatch[2]) {
        Object.assign(j, {
          status: 'cancelled',
          cancel_requested: true,
          finished_at: new Date().toISOString(),
        })
        return json(j)
      }
      if (!state.holdQueued && !['done', 'cancelled'].includes(j.status)) {
        state.reads++
        if (state.reads === 1)
          Object.assign(j, {
            status: 'running',
            progress: 50,
            queue_position: 0,
            started_at: new Date().toISOString(),
          })
        else if (state.reads >= 2) {
          Object.assign(j, {
            status: 'done',
            progress: 100,
            asset_id: 'asset-1',
            finished_at: new Date().toISOString(),
          })
          state.gallery = [
            {
              id: 'asset-1',
              job_id: j.id,
              url: '/api/images/asset-1/file',
              width: 512,
              height: 512,
              size_bytes: 345678,
              sha256: 'x',
              prompt: j.prompt,
              seed: j.seed,
              steps: j.steps,
              model: 'sd15',
              created_at: new Date().toISOString(),
            },
          ]
        }
      }
      return json(j)
    }
    if (p === '/api/images' && m === 'GET') {
      return json({ items: state.gallery, total: state.gallery.length, limit: 24, offset: 0 })
    }
    if (/^\/api\/images\/[^/]+\/file$/.test(p)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    }
    if (/^\/api\/images\/[^/]+$/.test(p) && m === 'DELETE') {
      state.gallery = []
      return route.fulfill({ status: 204, body: '' })
    }
    // Anything else the pages ask for: empty, so nothing fakes data.
    if (m === 'GET') return json({ detail: 'Not Found' }, 404)
    return json({ detail: 'not mocked' }, 404)
  }
}

// A recogniser that "hears" window.__phrase when stopped (hold-to-talk release).
function fakeSpeech() {
  class FakeRecognition {
    constructor() {
      this.lang = ''
      this.continuous = false
      this.interimResults = false
      this.onresult = null
      this.onerror = null
      this.onend = null
    }
    start() {
      window.__micStarted = (window.__micStarted || 0) + 1
    }
    stop() {
      const phrase = window.__phrase || ''
      setTimeout(() => {
        if (phrase)
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: true, 0: { transcript: phrase } }],
          })
        this.onend?.()
      }, 50)
    }
    abort() {}
  }
  // Chromium ships the unprefixed name too, and the app prefers it.
  window.SpeechRecognition = FakeRecognition
  window.webkitSpeechRecognition = FakeRecognition
  window.speechSynthesis = { speak() {}, cancel() {} }
  window.SpeechSynthesisUtterance = function (t) {
    this.text = t
  }
  try {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined })
  } catch {
    /* read-only in some builds */
  }
}

// ---- the flows --------------------------------------------------------------

const results = []
async function step(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push(true)
    console.log(`ok    ${name.padEnd(58)} ${Date.now() - started} ms`)
  } catch (e) {
    results.push(false)
    console.log(`FAIL  ${name.padEnd(58)} — ${String(e.message).split('\n')[0]}`)
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function newPage(browser, state) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await context.addInitScript(fakeSpeech)
  await context.route((u) => new URL(u).pathname.startsWith('/api/'), mockAureon(state))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { page, context, errors }
}

function freshState() {
  return {
    calls: [],
    jobs: 0,
    job: null,
    reads: 0,
    holdQueued: false,
    gallery: [],
    news: [
      doc('n1', 'Gold climbs as the Fed signals a pause', 'Reuters', '2026-11-04T05:00:00Z'),
      doc('n2', 'Euro steadies ahead of ECB minutes', 'FXStreet', '2026-11-04T04:00:00Z'),
      doc('n3', 'Oil slides on supply worries', 'Reuters', '2026-11-04T03:00:00Z'),
    ],
  }
}

async function newsFlow(browser) {
  const state = freshState()
  const { page, context, errors } = await newPage(browser, state)
  await step('news: cards render from /api/public/forex', async () => {
    await page.goto(`${BASE}/dev/shot/news`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ncard', { timeout: 60_000 })
    expect((await page.locator('.ncard').count()) === 3, 'expected 3 cards')
    expect(/IST/.test(await page.locator('.ncard time').first().innerText()), 'time in IST')
  })
  await step('news: symbol filter XAUUSD keeps only gold/USD headlines', async () => {
    await page.getByPlaceholder('Symbol (XAUUSD) or words').fill('XAUUSD')
    await page.waitForFunction(() => document.querySelectorAll('.ncard').length === 1)
    const text = await page.locator('.ncard').innerText()
    expect(text.includes('Gold climbs'), 'gold headline shown')
    expect((await page.locator('.ncard__chips').innerText()).includes('gold'), 'mentions chip')
  })
  await step('news: words filter, then clear', async () => {
    await page.getByPlaceholder('Symbol (XAUUSD) or words').fill('supply worries')
    await page.waitForFunction(() => document.querySelectorAll('.ncard').length === 1)
    expect((await page.locator('.ncard').innerText()).includes('Oil'), 'oil headline')
    await page.locator('[data-testid="news-clear"]').click()
    await page.waitForFunction(() => document.querySelectorAll('.ncard').length === 3)
  })
  await step('news: a new headline waits behind the pill', async () => {
    state.news = [
      doc('n4', 'Dollar jumps after payrolls beat', 'Reuters', '2026-11-04T06:00:00Z'),
      ...state.news,
    ]
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    const pill = page.locator('[data-testid="news-fresh"]')
    await pill.waitFor({ timeout: 10_000 })
    expect((await page.locator('.ncard').count()) === 3, 'not shown before the tap')
    await pill.click()
    await page.waitForFunction(() => document.querySelectorAll('.ncard').length === 4)
    expect((await page.locator('.ncard').first().innerText()).includes('payrolls'), 'newest first')
  })
  await step('news: no page errors', async () => expect(!errors.length, errors[0]))
  await context.close()
}

async function holdMic(page, phrase) {
  await page.evaluate((p) => (window.__phrase = p), phrase)
  const mic = page.locator('[data-testid="voice-mic"]')
  await mic.waitFor({ timeout: 60_000 })
  const box = await mic.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(600)
  await page.mouse.up()
}

async function voiceFlow(browser) {
  const state = freshState()
  const { page, context, errors } = await newPage(browser, state)
  await step('voice: hold-to-talk "open the news" navigates to /news', async () => {
    await page.goto(`${BASE}/images`, { waitUntil: 'domcontentloaded' })
    await holdMic(page, 'open the news')
    await page.waitForURL('**/news', { timeout: 90_000 }).catch(async (e) => {
      const panel = await page
        .locator('.va__panel')
        .innerText()
        .catch(() => '(no panel)')
      const started = await page.evaluate(() => window.__micStarted)
      throw new Error(`${e.message.split('\n')[0]} · mic started ${started} · panel: ${panel}`)
    })
    const result = await page.locator('[data-testid="voice-result"]').innerText()
    expect(result.includes('open_news') && result.includes('Opening News'), `result: ${result}`)
    expect(!state.calls.includes('POST /api/v1/voice/intent'), 'app screens resolve locally')
  })
  await step('voice: "approve request 12" is read-only and opens the approval', async () => {
    await holdMic(page, 'approve request 12')
    await page.waitForURL(/\/dev\/inbox\?id=12/, { timeout: 90_000 })
    const panel = await page.locator('.va__panel').innerText()
    expect(/open it in Spasta/i.test(panel), 'says open it in Spasta')
    expect(panel.includes('needs_approval'), 'intent shown')
    expect(state.calls.includes('POST /api/v1/voice/intent'), 'asked the server')
  })
  await step('voice: typed fallback works', async () => {
    await page.locator('#voice-text').fill('show images')
    await page.locator('.va__form button[type="submit"]').click()
    await page.waitForURL('**/images', { timeout: 60_000 })
  })
  await step('voice: no page errors', async () => expect(!errors.length, errors[0]))
  await context.close()
}

async function imageFlow(browser) {
  const state = freshState()
  const { page, context, errors } = await newPage(browser, state)
  await step('images: generate queues a job with an ETA estimate', async () => {
    await page.goto(`${BASE}/images`, { waitUntil: 'domcontentloaded' })
    await page.locator('#img-prompt').waitFor({ timeout: 60_000 })
    await page.locator('#img-prompt').fill('A lighthouse at dusk')
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.getByText('Queued · 1 ahead').waitFor({ timeout: 5_000 })
    expect(await page.getByText(/estimate: about 10 min per image/).isVisible(), 'ETA estimate')
  })
  await step('images: progress, then done, in the gallery', async () => {
    const wait = (loc, what, timeout = 10_000) =>
      loc.waitFor({ timeout }).catch(() => {
        throw new Error(`no ${what}`)
      })
    await wait(page.getByText('Generating · 50%'), 'running line')
    await wait(page.locator('[role="progressbar"]').first(), 'progress bar', 3_000)
    await wait(page.locator('[data-testid="image-done-notice"]'), 'finished notice')
    expect(
      (await page.locator('[data-testid="image-done-notice"]').innerText()).includes('ready'),
      'says it is ready',
    )
    await wait(page.locator('.img-tile').first(), 'gallery tile', 5_000)
    expect((await page.locator('.img-meta').first().innerText()).includes('25 steps'), 'metadata')
  })
  await step('images: full view offers Download, delete removes it', async () => {
    await page.locator('.img-tile').first().click()
    const dl = page.getByRole('link', { name: 'Download' })
    await dl.waitFor({ timeout: 5_000 })
    expect((await dl.getAttribute('download'))?.endsWith('.png'), 'download attribute')
    await page.getByRole('button', { name: 'Delete…' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByText('No images yet').waitFor({ timeout: 5_000 })
    expect(state.calls.includes('DELETE /api/images/asset-1'), 'DELETE sent')
  })
  await step('images: a queued job can be cancelled', async () => {
    state.holdQueued = true
    await page.locator('#img-prompt').fill('A second one')
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByText('Cancelled').first().waitFor({ timeout: 5_000 })
  })
  await step('images: no page errors', async () => expect(!errors.length, errors[0]))
  await context.close()
}

async function main() {
  const server = EXTERNAL ? null : await startServer()
  const browser = await chromium.launch()
  try {
    await newsFlow(browser)
    await voiceFlow(browser)
    await imageFlow(browser)
  } finally {
    await browser.close()
    server?.kill('SIGTERM')
  }
  const ok = results.every(Boolean)
  console.log(ok ? `\nagents e2e: all ${results.length} steps passed` : '\nagents e2e: FAILED')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
