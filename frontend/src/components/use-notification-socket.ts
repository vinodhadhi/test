import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notificationSocketUrl } from '../api/client'

export function useNotificationSocket() {
  const client = useQueryClient()
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    let disposed = false
    let socket: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout>
    let watchdog: ReturnType<typeof setTimeout>
    let attempts = 0
    const schedule = () => {
      if (!disposed) retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)))
    }
    const connect = () => {
      if (disposed) return
      try { socket = new WebSocket(notificationSocketUrl()) } catch { schedule(); return }
      const current = socket
      const armWatchdog = () => {
        clearTimeout(watchdog)
        watchdog = setTimeout(() => { setConnected(false); current.close() }, 20000)
      }
      armWatchdog()
      current.onmessage = (message) => {
        if (disposed) return
        try {
          const event = JSON.parse(message.data)
          if (!['notifications_changed', 'heartbeat'].includes(event.type)) return
          attempts = 0
          setConnected(true)
          armWatchdog()
          if (event.type === 'notifications_changed') client.invalidateQueries({ queryKey: ['notifications'] })
        } catch { /* Ignore malformed messages; polling remains available. */ }
      }
      current.onerror = () => current.close()
      current.onclose = () => {
        clearTimeout(watchdog)
        if (disposed) return
        setConnected(false)
        schedule()
      }
    }
    connect()
    return () => { disposed = true; clearTimeout(retry); clearTimeout(watchdog); socket?.close() }
  }, [client])
  return connected
}
