/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import netlify from '@netlify/vite-plugin'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { visualizer } from 'rollup-plugin-visualizer'

// The PWA/service worker is a build+serve concern only. It is skipped under
// Vitest so the test run stays a plain module graph with no SW virtual modules.
// THE NETLIFY FUNCTIONS HAVE TO RUN IN DEV TOO.
//
// `netlify/functions/github.ts` declares `config.path = '/api/github'`, and
// `VITE_GH_PROXY_URL` points at it — but a plain `vite` knows nothing about
// either, so in development that POST fell through to the SPA fallback and came
// back as `index.html`. The caller then failed parsing HTML as JSON, which reads
// like a broken proxy rather than an absent one.
//
// The plugin is what serves those functions locally, on the same port and at the
// same path they answer on in production. Left out under Vitest: the test run is
// a module graph, not a server.
if (!process.env.VITEST) {
  // A FUNCTION READS `process.env`, NOT `import.meta.env`. Vite only exposes
  // `VITE_`-prefixed values to the client and never touches `process.env`, so
  // the server-only names in `.env` — GITHUB_TOKEN above all — were simply
  // absent locally and the function answered "GITHUB_TOKEN is not configured".
  // Anything already set in the real environment wins, so this cannot override
  // what a deploy or a shell provides.
  const fileEnv = loadEnv('development', process.cwd(), '')
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const plugins = [vue(), vueDevTools()]
if (!process.env.VITEST) {
  // Only what this project uses. The plugin emulates every Netlify feature by
  // default, and Edge Functions emulation spawns a Deno server with a flag
  // (`--allow-scripts`) older Deno builds reject — which crashed `vite` on
  // start, taking the whole dev server down for a feature nothing here uses.
  // Functions stay on: they are what serve `/api/github`.
  plugins.push(
    netlify({
      edgeFunctions: { enabled: false },
      blobs: { enabled: false },
      database: { enabled: false },
      geolocation: { enabled: false },
    }),
  )
  plugins.push(
    VitePWA({
      // A new deploy's SW takes over automatically — no "click to refresh".
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Aureon',
        short_name: 'Aureon',
        description: 'Liquid-glass personal tracker — todos, tasks, deadlines, finances.',
        theme_color: '#181a34',
        background_color: '#181a34',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Precache the built app shell + assets so routes load with no network.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2,png,jpg,jpeg,webp}'],
        // …but not the heavy chunks the first paint deliberately does not load.
        // Precaching starts as soon as the worker installs, which is while the
        // first screen is still painting: leaving JointJS, FullCalendar, Leaflet
        // and Firestore in there means a megabyte of code nobody has asked for
        // yet competing for bandwidth with the code being rendered. They are
        // cached by the runtime rule below the first time a route actually
        // pulls them in.
        globIgnores: [
          '**/jointjs-*.js',
          '**/fullcalendar-*.js',
          '**/leaflet-*.js',
          '**/leaflet-*.css',
          '**/firebase-firestore-*.js',
        ],
        // SPA: any offline navigation falls back to the cached shell.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // HTML / navigations: prefer the network, fall back to cache offline.
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'html', networkTimeoutSeconds: 3 },
          },
          {
            // The chunks left out of the precache: cached the first time a
            // route loads them, served from cache on every visit after, so the
            // offline story is unchanged past the first use of each route.
            urlPattern: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
              sameOrigin && (request.destination === 'script' || request.destination === 'style'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'lazy-chunks', expiration: { maxEntries: 60 } },
          },
          {
            // Fonts rarely change — serve from cache first.
            urlPattern: ({ request }: { request: Request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Images: cache first with a bounded cache.
            urlPattern: ({ request }: { request: Request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  )
}

// `ANALYZE=1 npm run build:only` writes dist/stats.html — the treemap behind the
// bundle numbers quoted in the PR, rather than a guess at what is heavy.
if (process.env.ANALYZE) {
  plugins.push(
    visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true }) as never,
  )
}

// https://vite.dev/config/
export default defineConfig({
  plugins,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // The only chunk over Rollup's 500KB default is the Firestore SDK, which is
    // a single vendor module that cannot be split further and no longer loads
    // until after sign-in. The limit is raised to just above it so a genuinely
    // oversized chunk still warns rather than the build shipping a standing one.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split the vendors that change on different schedules from the app and
        // from each other: Firestore is only needed once someone is signed in,
        // and keeping it out of the shell chunk means a shell change does not
        // re-download it.
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined
          // re2js is Firestore's regex engine and nothing else uses it. Left in
          // `vendor` it rides along with Vue in the eagerly preloaded chunk —
          // 72KB gzipped of a database dependency downloaded before the sign-in
          // card paints — so it is pinned to the chunk that actually needs it.
          if (
            id.includes('@firebase/firestore') ||
            id.includes('firebase/firestore') ||
            id.includes('re2js')
          ) {
            return 'firebase-firestore'
          }
          if (id.includes('@firebase/auth') || id.includes('firebase/auth')) return 'firebase-auth'
          if (id.includes('@firebase') || id.includes('firebase')) return 'firebase-core'
          if (id.includes('@fullcalendar')) return 'fullcalendar'
          if (id.includes('@joint') || id.includes('jointjs')) return 'jointjs'
          if (id.includes('leaflet')) return 'leaflet'
          // The sanitiser is reached from anything that renders stored HTML —
          // a trip's place notes, a shared note — so it is its own chunk rather
          // than riding along with the markdown parser those views never need.
          if (id.includes('dompurify')) return 'sanitize'
          // The notes markdown pipeline. Only ever reached from a note, so it
          // is kept out of `vendor` — which is eagerly preloaded — and travels
          // with the views that render markdown instead.
          if (
            id.includes('markdown-it') ||
            id.includes('linkify-it') ||
            id.includes('mdurl') ||
            id.includes('uc.micro') ||
            id.includes('entities') ||
            id.includes('punycode')
          ) {
            return 'markdown'
          }
          if (id.includes('turndown') || id.includes('domino')) return 'turndown'
          // The syntax highlighter: fetched only by a note that has a fence, so
          // it must not be merged into anything a note without one pulls in.
          if (id.includes('highlight.js')) return 'highlight'
          // The grid virtualiser is reached only from the goals grid, which
          // lives behind the workspace route. Left in `vendor` it rides in the
          // eagerly preloaded chunk, ~7KB gzipped downloaded before sign-in for
          // a list the reader may never open.
          if (id.includes('@tanstack')) return 'virtual'
          if (id.includes('viem') || id.includes('@noble') || id.includes('@scure')) return 'crypto'
          if (id.includes('qrcode')) return 'qrcode'
          return 'vendor'
        },
      },
    },
  },
  test: {
    // jsdom for the browser globals the utils reach for: btoa/atob, location,
    // crypto.subtle in the PIN hashing path.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
