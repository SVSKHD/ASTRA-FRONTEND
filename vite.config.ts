/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { visualizer } from 'rollup-plugin-visualizer'

// The PWA/service worker is a build+serve concern only. It is skipped under
// Vitest so the test run stays a plain module graph with no SW virtual modules.
const plugins = [vue(), vueDevTools()]
if (!process.env.VITEST) {
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
