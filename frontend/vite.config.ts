import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      ...Object.fromEntries(['/auth', '/users', '/projects', '/manager', '/my', '/bugs', '/attachments', '/dashboard', '/health'].map((path) => [path, process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'])),
      '/ws': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000', ws: true },
    },
  },
})
