import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { chatSocketUrl, endpoints, type Bug, type BugComment } from '../../api/client'

type ChatEvent =
  | { type: 'comment'; comment: BugComment }
  | { type: 'typing'; user_id: number; user_name: string; is_typing: boolean }
  | { type: 'bug_updated' }

export function useBugChat(bugId: number, userId?: number) {
  const client = useQueryClient()
  const socket = useRef<WebSocket | null>(null)
  const lastTyping = useRef(0)
  const [typing, setTyping] = useState<Record<number, { name: string; until: number }>>({})
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!Number.isInteger(bugId) || bugId < 1 || !userId) return
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const connect = () => {
      const ws = new WebSocket(chatSocketUrl(bugId))
      socket.current = ws
      ws.onopen = () => {
        attempts = 0
        setConnected(true)
        client.invalidateQueries({ queryKey: ['bug', bugId] })
      }
      ws.onmessage = (message) => {
        let event: ChatEvent
        try { event = JSON.parse(message.data) as ChatEvent } catch { return }
        if (event.type === 'comment' && event.comment?.bug_id === bugId) {
          client.setQueryData<Bug>(['bug', bugId], (current) => current && !current.comments.some((entry) => entry.id === event.comment.id)
            ? { ...current, comments: [...current.comments, event.comment] } : current)
          setTyping((current) => { const next = { ...current }; delete next[event.comment.user_id]; return next })
        } else if (event.type === 'bug_updated') {
          client.invalidateQueries({ queryKey: ['bug', bugId] })
          client.invalidateQueries({ queryKey: ['bugs'] })
          client.invalidateQueries({ queryKey: ['dashboard'] })
        } else if (event.type === 'typing' && event.user_id !== userId) {
          setTyping((current) => {
            const next = { ...current }
            if (event.is_typing) next[event.user_id] = { name: event.user_name, until: Date.now() + 4500 }
            else delete next[event.user_id]
            return next
          })
        }
      }
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null
        setConnected(false)
        setTyping({})
        if (!stopped) retry = setTimeout(async () => {
          // WebSocket handshakes cannot use the REST client's 401 refresh path.
          // Refresh the short-lived access cookie before the next handshake.
          try { await endpoints.me() } catch { /* A later attempt can succeed after login. */ }
          if (!stopped) connect()
        }, Math.min(1000 * 2 ** attempts++, 10000))
      }
    }
    connect()
    const expiry = setInterval(() => setTyping((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([, value]) => value.until > Date.now()))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    }), 1000)
    return () => { stopped = true; clearTimeout(retry); clearInterval(expiry); socket.current?.close(); socket.current = null }
  }, [bugId, userId, client])

  const sendTyping = (isTyping: boolean) => {
    const ws = socket.current
    if (ws?.readyState !== WebSocket.OPEN) return
    if (isTyping && Date.now() - lastTyping.current < 1500) return
    if (isTyping) lastTyping.current = Date.now()
    ws.send(JSON.stringify({ type: 'typing', is_typing: isTyping }))
  }
  return { connected, typingUsers: Object.values(typing).map((entry) => entry.name), sendTyping }
}
