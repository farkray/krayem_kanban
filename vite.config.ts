/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": el usuario decide cuándo recargar a la nueva versión (no se pierde lo que está editando).
      registerType: 'prompt',
      injectRegister: false, // el registro se hace en src/pwa/register.ts
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Kanban',
        short_name: 'Kanban',
        description: 'Tableros Kanban con guardado automático en la nube.',
        lang: 'es',
        dir: 'ltr',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0d7388',
        background_color: '#e1ecef',
        categories: ['productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell y assets con hash (incluye .wasm para la compresión de imágenes).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,wasm,woff2}'],
        // config.js lo genera el contenedor al arrancar: no puede quedar congelado en el precache.
        globIgnores: [
          'config.js',
          // Variantes de codec que casi nunca se usan: se cachean solo si hacen falta (ver runtimeCaching).
          '**/squooshhqx_bg-*.wasm',
          '**/jsquash_magic_kernel_bg-*.wasm',
          '**/webp_enc-*.wasm',
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'wasm', expiration: { maxEntries: 10 } },
          },
          {
            // Red primero (config al día); si no hay red, la última copia para poder abrir offline.
            urlPattern: ({ url }) => url.pathname === '/config.js',
            handler: 'NetworkFirst',
            options: { cacheName: 'runtime-config', networkTimeoutSeconds: 3 },
          },
        ],
        // Las llamadas a /api NO se cachean: de eso se encarga el outbox.
      },
      devOptions: { enabled: false },
    }),
  ],
  // Los codecs WASM cargan sus .wasm con new URL(..., import.meta.url): que Vite no los pre-empaquete.
  optimizeDeps: { exclude: ['@jsquash/webp', '@jsquash/resize'] },
  worker: { format: 'es' },
  // Desarrollo con sincronización: `npm run dev:server` y VITE_API_URL=/api
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    css: false,
    exclude: ['e2e/**', '**/node_modules/**'], // los E2E los corre Playwright
  },
})
