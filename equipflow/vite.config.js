import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vite config for the borrower site. This is the ONLY project that is a PWA
// (equipflow-admin has no PWA plugin).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // new versions install themselves in the background
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'EquipFlow',
        short_name: 'EquipFlow',
        description: 'Borrow and track school equipment and books.',
        theme_color: '#1d4ed8',
        background_color: '#f4f6fb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Only the app itself (HTML, JS, CSS, icons) is cached for offline use.
      // API calls are never cached, so loans and fines are always fresh.
      workbox: { navigateFallback: '/index.html' },
    }),
  ],
  // Ports match the CORS defaults in the backend (borrower site 3000, admin site 3001).
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
