import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { endpoints, type Notification } from '../api/client'

export function Notifications() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const query = useQuery({ queryKey: ['notifications'], queryFn: endpoints.notifications, refetchInterval: 15000, refetchOnWindowFocus: true })
  const readOne = useMutation({ mutationFn: endpoints.markNotificationRead, onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }) })
  const readAll = useMutation({ mutationFn: endpoints.markAllNotificationsRead, onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }) })

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  const openNotification = (item: Notification) => {
    if (!item.read_at) readOne.mutate(item.id)
    setOpen(false)
    navigate(item.link)
  }

  return <div className="notification-wrapper" ref={wrapper}>
    <button type="button" className="notification-trigger" aria-label={`Notifications${query.data?.unread_count ? `, ${query.data.unread_count} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Bell size={18} />{Boolean(query.data?.unread_count) && <span className="notification-badge">{Math.min(query.data!.unread_count, 99)}</span>}</button>
    {open && <div className="notification-panel"><div className="notification-heading"><b>Notifications</b>{Boolean(query.data?.unread_count) && <button type="button" onClick={() => readAll.mutate()} disabled={readAll.isPending}>Mark all read</button>}</div>
      {query.isError ? <p className="notification-empty">Could not load notifications. <button type="button" onClick={() => query.refetch()}>Retry</button></p> : query.isPending ? <p className="notification-empty">Loading notifications…</p> : query.data.items.length === 0 ? <p className="notification-empty">No notifications yet.</p> : <div className="notification-list">{query.data.items.map((item) => <button type="button" className={`notification-item${item.read_at ? '' : ' unread'}`} key={item.id} onClick={() => openNotification(item)}><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.created_at).toLocaleString()}</small></button>)}</div>}
    </div>}
  </div>
}
