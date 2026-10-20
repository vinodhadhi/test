import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const https = process.env.VITE_HTTPS_KEY && process.env.VITE_HTTPS_CERT
  ? { key: readFileSync(process.env.VITE_HTTPS_KEY), cert: readFileSync(process.env.VITE_HTTPS_CERT) }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    https,
    proxy: {
      ...Object.fromEntries(['/auth', '/users', '/projects', '/manager', '/my', '/bugs', '/attachments', '/dashboard', '/health'].map((path) => [path, process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'])),
      '/ws': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000', ws: true },
    },
  },
})
