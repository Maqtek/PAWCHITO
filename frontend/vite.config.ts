/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// В Docker бэкенд — соседний контейнер: API_PROXY_TARGET=http://backend:8000.
const backend = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Когда моки выключены (VITE_MOCKS=false), запросы идут на бэкенд.
    // Фото /media в разработке тоже отдаёт бэкенд, на проде — Caddy.
    proxy: { '/api': backend, '/media': backend },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
