import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const https = process.env.VITE_HTTPS_KEY && process.env.VITE_HTTPS_CERT
  ? { key: readFileSync(process.env.VITE_HTTPS_KEY), cert: readFileSync(process.env.VITE_HTTPS_CERT) }
  : undefined

const primaryTarget = process.env.VITE_API_PROXY_TARGET ?? 'https://test-seven-woad-nvkrw3zwum.vercel.app'
const fallbackTarget = process.env.VITE_API_FALLBACK_TARGET ?? 'http://127.0.0.1:8000'
let selectedTarget = primaryTarget
let checkedAt = 0
let pendingCheck: Promise<void> | undefined
let setProxyTarget = (_target: string) => {}

async function backendTarget() {
  if (Date.now() - checkedAt > 3000) {
    pendingCheck ??= (async () => {
      try {
        const response = await fetch(`${primaryTarget.replace(/\/$/, '')}/health`, {
          signal: AbortSignal.timeout(1500),
          redirect: 'error',
        })
        const health = response.ok ? await response.json() : null
        selectedTarget = health?.status === 'ok' ? primaryTarget : fallbackTarget
      } catch {
        selectedTarget = fallbackTarget
      } finally {
        checkedAt = Date.now()
        pendingCheck = undefined
      }
    })()
    await pendingCheck
  }
  return selectedTarget
}

export default defineConfig({
  plugins: [react()],
  server: {
    https,
    proxy: {
      '/api': {
        target: primaryTarget,
        configure(proxy) {
          // http-proxy stores constructor options separately from Vite's copy.
          const runtimeProxy = proxy as typeof proxy & { options: ProxyOptions }
          setProxyTarget = (target) => { runtimeProxy.options.target = target }
        },
        async bypass(_req, _res, options) {
          options.target = await backendTarget()
          setProxyTarget(options.target)
        },
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
        cookiePathRewrite: { '/auth': '/api/auth' },
        cookieDomainRewrite: '',
        ws: true,
      },
    },
  },
})
