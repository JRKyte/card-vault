/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/. The workflow passes BASE_PATH; locally it's /.
const base = process.env.BASE_PATH ?? '/'
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Card Vault',
        short_name: 'Cards',
        description: 'Track your cards, finish your sets.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0b0912',
        background_color: '#0b0912',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Card art and set symbols. Older sets live on pokemontcg.io, newer ones on scrydex.com.
            urlPattern: ({ url }) =>
              url.hostname === 'images.pokemontcg.io' || url.hostname === 'images.scrydex.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'api.pokemontcg.io',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tcg-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Supabase reads, so the dashboard and set pages still render offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // The card scanner's text recogniser (engine + English data), so scanning works offline.
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' && /tesseract/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // The picture matcher's engine (bundled .wasm). The model itself is cached by transformers.js.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'artmatch-engine', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Card fingerprints: the list is checked each time; vector files have a hash in their name.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/fingerprints/') && url.pathname.endsWith('.bin'),
            handler: 'CacheFirst',
            options: { cacheName: 'fingerprints', expiration: { maxEntries: 4 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('/fingerprints/index.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'fingerprints-index', networkTimeoutSeconds: 5, expiration: { maxEntries: 2 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
