import { Mic, MonitorUp, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Notice } from '../../components/ui'

export type RecordedFile = { file: File; previewUrl: string; duration: number; kind: 'voice' | 'screen' }

export function Recorder({ onAdd }: { onAdd: (recording: RecordedFile) => void }) {
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)
  const started = useRef(0)
  const [active, setActive] = useState<'voice' | 'screen' | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<RecordedFile | null>(null)
  const closeStream = () => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null }

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); closeStream(); if (preview) URL.revokeObjectURL(preview.previewUrl) }, [preview])

  const start = async (kind: 'voice' | 'screen') => {
    setError('')
    try {
      const media = kind === 'voice' ? await navigator.mediaDevices.getUserMedia({ audio: true }) : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      stream.current = media
      const candidates = kind === 'voice'
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      const supported = candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
      const options = supported ? { mimeType: supported } : undefined
      const activeRecorder = new MediaRecorder(media, options)
      const chunks: BlobPart[] = []
      started.current = Date.now()
      recorder.current = activeRecorder
      activeRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      activeRecorder.onstop = () => {
        const duration = Math.min(120, Math.max(1, Math.round((Date.now() - started.current) / 1000)))
        const mime = activeRecorder.mimeType || supported || (kind === 'voice' ? 'audio/webm' : 'video/webm')
        const extension = mime.includes('mp4') ? 'mp4' : 'webm'
        const file = new File(chunks, `${kind}-recording-${Date.now()}.${extension}`, { type: mime })
        const item = { file, previewUrl: URL.createObjectURL(file), duration, kind }
        setPreview((previous) => { if (previous) URL.revokeObjectURL(previous.previewUrl); return item })
        closeStream()
        setActive(null)
      }
      activeRecorder.start(500)
      setActive(kind)
      setSeconds(0)
      timer.current = window.setInterval(() => { const elapsed = Math.floor((Date.now() - started.current) / 1000); setSeconds(elapsed); if (elapsed >= 120) stop() }, 500)
      media.getVideoTracks().forEach((track) => { track.onended = () => stop() })
    } catch (reason) {
      closeStream()
      setError(reason instanceof Error ? reason.message : 'Could not start recording. Check browser permissions.')
    }
  }

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }
  const accept = () => { if (!preview) return; onAdd(preview); setPreview(null) }
  const discard = () => { if (preview) URL.revokeObjectURL(preview.previewUrl); setPreview(null) }

  return <div className="recorder-box">
    <Notice tone="info">Voice and screen recordings can contain sensitive information. Review each recording before attaching it. Recordings are limited to 2 minutes and retained for the configured period.</Notice>
    {error && <Notice>{error}</Notice>}
    {!active && !preview && <div className="recorder-actions"><Button type="button" variant="secondary" onClick={() => start('voice')}><Mic size={15} /> Record voice</Button><Button type="button" variant="secondary" onClick={() => start('screen')}><MonitorUp size={15} /> Record screen</Button></div>}
    {active && <div className="recording-live"><span className="recording-dot" /><span>{active === 'voice' ? 'Voice recording' : 'Screen recording'}</span><b>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')} / 02:00</b><Button type="button" variant="danger" onClick={stop}><Square size={13} fill="currentColor" /> Stop</Button></div>}
    {preview && <div className="record-preview"><div><b>Preview recording</b><small>{preview.file.name} · {preview.duration}s · {(preview.file.size / 1024 / 1024).toFixed(1)} MB</small></div>{preview.kind === 'voice' ? <audio controls src={preview.previewUrl} /> : <video controls src={preview.previewUrl} /> }<div className="recorder-actions"><Button type="button" onClick={accept}>Attach recording</Button><Button type="button" variant="ghost" onClick={discard}><Trash2 size={15} /> Discard</Button></div></div>}
  </div>
}
