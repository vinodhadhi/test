import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

type Props = {
  disabled: boolean
  onFile: (file: File) => void
  onBusy: (busy: boolean) => void
  onError: (message: string) => void
}

export function ScreenRecorder({ disabled, onFile, onBusy, onError }: Props) {
  const [state, setState] = useState<'idle' | 'choosing' | 'recording' | 'saving'>('idle')
  const [seconds, setSeconds] = useState(0)
  const active = useRef(false)
  const mounted = useRef(true)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval>>()
  const callbacks = useRef({ onFile, onBusy, onError })
  callbacks.current = { onFile, onBusy, onError }

  const stop = () => {
    if (recorder.current?.state === 'recording') {
      setState('saving')
      recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearInterval(timer.current)
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const start = async () => {
    if (active.current || disabled) return
    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      onError('Screen recording needs a supported browser on HTTPS or localhost. You can still attach an existing video.')
      return
    }
    const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) { onError('This browser cannot record MP4 or WebM. Please attach an existing video.'); return }
    active.current = true
    onBusy(true)
    onError('')
    setState('choosing')
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
      if (!mounted.current) { capture.getTracks().forEach((track) => track.stop()); return }
      stream.current = capture
      const recording = new MediaRecorder(capture, { mimeType, videoBitsPerSecond: 1_000_000 })
      recorder.current = recording
      const chunks: Blob[] = []
      let size = 0
      let failed = false
      const started = Date.now()
      recording.ondataavailable = (event) => {
        if (event.data.size) { chunks.push(event.data); size += event.data.size }
        if (size > 25 * 1024 * 1024) stop()
      }
      recording.onerror = () => {
        failed = true
        if (mounted.current) callbacks.current.onError('Recording failed. Please try again or attach an existing video.')
        stop()
      }
      recording.onstop = () => {
        clearInterval(timer.current)
        capture.getTracks().forEach((track) => track.stop())
        recorder.current = null
        stream.current = null
        active.current = false
        if (!mounted.current) return
        if (!failed) {
          if (size === 0 || size > 25 * 1024 * 1024) {
            callbacks.current.onError(size === 0 ? 'No recording was captured. Please try again.' : 'Recording exceeds 25 MB. Please record a shorter clip.')
          } else {
            const type = recording.mimeType.split(';')[0]
            const blob = new Blob(chunks, { type })
            callbacks.current.onFile(new File([blob], `screen-recording-${Date.now()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type }))
          }
        }
        setState('idle')
        callbacks.current.onBusy(false)
      }
      capture.getVideoTracks().forEach((track) => track.addEventListener('ended', stop, { once: true }))
      recording.start(500)
      setSeconds(0)
      setState('recording')
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000)
        setSeconds(elapsed)
        if (elapsed >= 120) stop()
      }, 250)
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
      active.current = false
      if (!mounted.current) return
      setState('idle')
      callbacks.current.onBusy(false)
      callbacks.current.onError(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Screen sharing was cancelled or denied. Click Record screen to try again.'
        : 'Could not start screen recording. Check browser permissions and try again.')
    }
  }

  return <div className="upload-zone">
    <div><b>Record your screen</b><small>Choose a tab, window, or screen in the browser prompt. Up to 2 minutes, without audio.</small>
      <span role="status" aria-live="polite">{state === 'recording' ? `Recording ${seconds}s / 120s` : state === 'choosing' ? 'Choose what to share in your browser…' : state === 'saving' ? 'Preparing recording…' : ''}</span>
    </div>
    {state === 'recording' ? <Button type="button" variant="secondary" onClick={stop}>Stop recording</Button>
      : <Button type="button" variant="secondary" disabled={disabled || state !== 'idle'} onClick={start}>Record screen</Button>}
  </div>
}
