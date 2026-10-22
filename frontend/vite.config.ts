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
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
        cookiePathRewrite: { '/auth': '/api/auth' },
        ws: true,
      },
    },
  },
})
