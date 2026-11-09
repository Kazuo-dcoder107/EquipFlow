import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The admin site is a plain website. It is deliberately NOT a PWA: no manifest, no service
// worker, nothing installable (only the borrower site, "equipflow", is a PWA).
export default defineConfig({
  plugins: [react()],
  // Ports match the CORS defaults in the backend (borrower site 3000, admin site 3001).
  server: { port: 3001, strictPort: true },
  preview: { port: 3001, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
