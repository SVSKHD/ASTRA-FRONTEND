/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

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

// https://vite.dev/config/
export default defineConfig({
  plugins,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jsdom for the browser globals the utils reach for: btoa/atob, location,
    // crypto.subtle in the PIN hashing path.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
