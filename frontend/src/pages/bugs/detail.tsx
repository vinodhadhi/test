import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Download, MessageCircle, RotateCcw, Send, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { endpoints, type Bug, type BugStatus, type BugSeverity, type BugType } from '../../api/client'
import { Button, Card, Field, Input, Notice, Select, Textarea } from '../../components/ui'
import { useBugChat } from './useBugChat'

const transitionMap: Record<BugStatus, BugStatus[]> = { Open: ['In Progress'], 'In Progress': ['Fixed'], Fixed: ['Verified', 'Reopened'], Verified: [], Reopened: ['In Progress'] }
type BugEdit = Pick<Bug, 'module_id' | 'title' | 'steps' | 'expected_result' | 'actual_result' | 'severity' | 'priority' | 'type' | 'assigned_to' | 'environment' | 'build_version'>

function Playback({ src, video = false }: { src: string; video?: boolean }) {
  const media = useRef<HTMLMediaElement | null>(null)
  const [speed, setSpeed] = useState(1)
  const speeds = [1, 1.5, 2]
  const changeSpeed = (value: number) => setSpeed(value)
  return <div className="media-player">{video ? <video ref={(element) => { media.current = element }} controls src={src} onRateChange={(event) => setSpeed(event.currentTarget.playbackRate)} onLoadedMetadata={(event) => { event.currentTarget.playbackRate = speed }} /> : <audio ref={(element) => { media.current = element }} controls src={src} onRateChange={(event) => setSpeed(event.currentTarget.playbackRate)} onLoadedMetadata={(event) => { event.currentTarget.playbackRate = speed }} />}<div className="speed-options" aria-label="Playback speed">{speeds.map((value) => <button key={value} type="button" className={speed === value ? 'speed-active' : ''} onClick={() => { changeSpeed(value); if (media.current) media.current.playbackRate = value }}>{value}×</button>)}</div></div>
}

function PdfPreview({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false)
  return <div className="pdf-preview"><button className="attachment-download" type="button" onClick={() => setOpen((value) => !value)}>{open ? 'Hide PDF' : 'Preview PDF'}</button>{open && <><iframe src={src} title={`Preview ${title}`} loading="lazy" /><a className="attachment-download" href={src} target="_blank" rel="noreferrer"><Download size={15} /> Open PDF</a></>}</div>
}

export function BugDetailPage() {
  const { id } = useParams()
  const bugId = Number(id)
  const client = useQueryClient()
  const location = useLocation()
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const bug = useQuery({ queryKey: ['bug', bugId], queryFn: () => endpoints.bug(bugId), enabled: Number.isInteger(bugId) && bugId > 0 })
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState<BugEdit | null>(null)
  const modules = useQuery({ queryKey: ['my-modules', bug.data?.project_id], queryFn: () => endpoints.myModules(bug.data!.project_id), enabled: !!bug.data && editing })
  const developers = useQuery({ queryKey: ['project-developers', bug.data?.project_id], queryFn: () => endpoints.projectDevelopers(bug.data!.project_id), enabled: !!bug.data && editing })
  const [comment, setComment] = useState('')
  const { connected, typingUsers, sendTyping } = useBugChat(bugId, me.data?.id)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(typingTimer.current), [])
  const stopTyping = () => { clearTimeout(typingTimer.current); sendTyping(false) }
  const updateComment = (value: string) => {
    setComment(value)
    if (value.trim()) {
      sendTyping(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => sendTyping(false), 2500)
    } else stopTyping()
  }
  const [transitionComment, setTransitionComment] = useState('')
  const [actionError, setActionError] = useState('')
  const stateNotice = (location.state as { notice?: string; warning?: string } | null)
  const refreshBug = () => { client.invalidateQueries({ queryKey: ['bug', bugId] }); client.invalidateQueries({ queryKey: ['bugs'] }); client.invalidateQueries({ queryKey: ['dashboard'] }) }
  const transition = useMutation({ mutationFn: (target: BugStatus) => endpoints.transitionBug(bugId, target, transitionComment.trim() || undefined), onSuccess: () => { setActionError(''); setTransitionComment(''); refreshBug() }, onError: (error: Error) => setActionError(error.message) })
  const addComment = useMutation({ mutationFn: () => endpoints.addComment(bugId, comment.trim()), onSuccess: () => { setComment(''); stopTyping(); setActionError(''); refreshBug() }, onError: (error: Error) => setActionError(error.message) })
  const upload = useMutation({ mutationFn: async (files: FileList) => { for (const file of Array.from(files)) await endpoints.uploadAttachment(bugId, file); return true }, onSuccess: refreshBug, onError: (error: Error) => setActionError(error.message) })
  const saveEdit = useMutation({ mutationFn: (values: BugEdit) => endpoints.updateBug(bugId, values), onSuccess: () => { setEditing(false); setEditValues(null); setActionError(''); refreshBug() }, onError: (error: Error) => setActionError(error.message) })

  if (bug.isPending) return <div className="loading-row">Loading bug details…</div>
  if (bug.isError) return <Card className="empty-state"><b>Could not load this bug</b><span>{bug.error.message}</span><Link className="button button-secondary" to="/bugs"><ArrowLeft size={15} /> Back to bugs</Link></Card>
  const item = bug.data
  const user = me.data
  const canEdit = user?.role === 'Admin' || (user?.role === 'Tester' && item.reported_by === user.id && ['Open', 'Reopened'].includes(item.status))
  const startEdit = () => {
    setActionError('')
    setEditValues({ module_id: item.module_id, title: item.title, steps: item.steps, expected_result: item.expected_result, actual_result: item.actual_result, severity: item.severity, priority: item.priority, type: item.type, assigned_to: item.assigned_to, environment: item.environment ?? '', build_version: item.build_version ?? '' })
    setEditing(true)
  }
  const editField = <K extends keyof BugEdit>(key: K, value: BugEdit[K]) => setEditValues((current) => current ? { ...current, [key]: value } : current)
  const available = user?.role === 'Admin' ? transitionMap[item.status] : user?.role === 'Developer' && item.assigned_to === user.id ? transitionMap[item.status].filter((s) => s === 'In Progress' || s === 'Fixed') : user?.role === 'Tester' && item.reported_by === user.id ? transitionMap[item.status].filter((s) => s === 'Verified' || s === 'Reopened') : []
  const needsComment = (target: BugStatus) => target === 'Verified' || target === 'Reopened'
  const changeStatus = (target: BugStatus) => { setActionError(''); if (needsComment(target) && !transitionComment.trim()) { setActionError('Add a comment before verifying or reopening this bug.'); return } transition.mutate(target) }
  return <>
    <div className="detail-breadcrumb"><Link to="/bugs"><ArrowLeft size={15} /> Back to issues</Link><span>/</span><span>{item.project_name}</span><span>/</span><b>#{item.bug_no}</b></div>
    {stateNotice?.notice && <Notice tone="success">{stateNotice.notice}</Notice>}{stateNotice?.warning && <Notice>{stateNotice.warning}</Notice>}{actionError && <Notice>{actionError}</Notice>}
    <div className="bug-detail-grid"><main className="bug-main-column">
      <Card className="bug-detail-card"><div className="detail-topline"><span className={`severity severity-${item.severity.toLowerCase()}`}><i />{item.severity} severity</span><span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span><span className="detail-date">Reported {new Date(item.created_at).toLocaleString()}</span></div>
        {canEdit && <div className="detail-edit-action"><Button variant="secondary" onClick={() => editing ? (setEditing(false), setEditValues(null), setActionError('')) : startEdit()}>{editing ? 'Cancel edit' : 'Edit issue'}</Button></div>}
        {editing && editValues ? <form className="bug-edit-form" onSubmit={(event) => { event.preventDefault(); setActionError(''); saveEdit.mutate({ ...editValues, title: editValues.title.trim(), steps: editValues.steps.trim(), expected_result: editValues.expected_result.trim(), actual_result: editValues.actual_result.trim(), priority: editValues.priority.trim(), environment: editValues.environment?.trim() || null, build_version: editValues.build_version?.trim() || null }) }}>
          <Field label="Issue title"><Input required minLength={3} maxLength={300} value={editValues.title} onChange={(event) => editField('title', event.target.value)} /></Field>
          <div className="report-grid"><Field label="Module"><Select value={editValues.module_id} onChange={(event) => editField('module_id', Number(event.target.value))} disabled={modules.isPending}><option value={0}>Select a module</option>{(modules.data ?? []).map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}</Select></Field><Field label="Assign developer"><Select value={editValues.assigned_to} onChange={(event) => editField('assigned_to', Number(event.target.value))} disabled={developers.isPending}><option value={0}>Select a developer</option>{(developers.data ?? []).map((developer) => <option key={developer.id} value={developer.id}>{developer.full_name}</option>)}</Select></Field></div>
          <Field label="Steps to reproduce"><Textarea required rows={4} value={editValues.steps} onChange={(event) => editField('steps', event.target.value)} /></Field>
          <div className="report-grid"><Field label="Expected result"><Textarea required rows={3} value={editValues.expected_result} onChange={(event) => editField('expected_result', event.target.value)} /></Field><Field label="Actual result"><Textarea required rows={3} value={editValues.actual_result} onChange={(event) => editField('actual_result', event.target.value)} /></Field></div>
          <div className="report-grid report-grid-3"><Field label="Severity"><Select value={editValues.severity} onChange={(event) => editField('severity', event.target.value as BugSeverity)}>{['Critical', 'High', 'Medium', 'Low'].map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label="Issue type"><Select value={editValues.type} onChange={(event) => editField('type', event.target.value as BugType)}><option>Frontend</option><option>Backend</option></Select></Field><Field label="Priority"><Input required maxLength={30} value={editValues.priority} onChange={(event) => editField('priority', event.target.value)} /></Field></div>
          <div className="report-grid"><Field label="Environment"><Input maxLength={300} value={editValues.environment ?? ''} onChange={(event) => editField('environment', event.target.value)} /></Field><Field label="Build version"><Input maxLength={100} value={editValues.build_version ?? ''} onChange={(event) => editField('build_version', event.target.value)} /></Field></div>
          <div className="form-actions"><Button type="submit" disabled={saveEdit.isPending}>{saveEdit.isPending ? 'Saving…' : 'Save changes'}</Button></div>
        </form> : <><h1 className="bug-detail-title">{item.title}</h1><p className="bug-number">Issue #{item.bug_no} <span>·</span> {item.project_name} <span>·</span> {item.module_name}</p>
          <section className="detail-content"><h2>Steps to reproduce</h2><p className="preserve-lines">{item.steps}</p></section><div className="result-grid"><section className="result-box expected"><h2>Expected result</h2><p className="preserve-lines">{item.expected_result}</p></section><section className="result-box actual"><h2>Actual result</h2><p className="preserve-lines">{item.actual_result}</p></section></div>
          {(item.environment || item.build_version) && <div className="context-line">{item.environment && <span><b>Environment</b> {item.environment}</span>}{item.build_version && <span><b>Build</b> {item.build_version}</span>}</div>}</>}
      </Card>
      <Card className="detail-section"><div className="detail-section-head"><div><h2><MessageCircle size={16} /> Discussion</h2><span>{item.comments.length} comments <span aria-label={connected ? 'Live chat connected' : 'Live chat reconnecting'} title={connected ? 'Live chat connected' : 'Live chat reconnecting'} className={`chat-connection ${connected ? 'online' : ''}`} /></span></div></div><div className="comment-thread">{item.comments.length === 0 ? <div className="thread-empty">No comments yet.</div> : item.comments.map((entry) => <article className="comment-entry" key={entry.id}><div className="avatar avatar-small">{entry.user_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div className="comment-body"><div className="comment-meta"><b>{entry.user_name}</b><time>{new Date(entry.created_at).toLocaleString()}</time></div><p>{entry.body}</p></div></article>)}</div>{typingUsers.length > 0 && <div className="chat-typing" role="status"><span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing</span><span className="chat-typing-dots" aria-hidden="true"><i /><i /><i /></span></div>}{user && user.role !== 'Manager' && <form className="comment-form" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) addComment.mutate() }}><Input value={comment} onChange={(event) => updateComment(event.target.value)} onBlur={stopTyping} placeholder="Write a comment…" maxLength={10000} /><Button type="submit" disabled={!comment.trim() || addComment.isPending}><Send size={14} /> Send</Button></form>}</Card>
    </main><aside className="bug-side-column">
      <Card className="side-card"><h2>Assignment</h2><div className="assignee-info"><div className="avatar avatar-small">{item.assignee_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><b>{item.assignee_name}</b><small>Assigned developer</small></div></div><div className="reported-info"><UserRound size={14} /><span>Reported by <b>{item.reporter_name}</b></span></div><div className="detail-fact"><span>Issue type</span><b>{item.type}</b></div><div className="detail-fact"><span>Priority</span><b>{item.priority}</b></div></Card>
      <Card className="side-card attachment-card"><div className="side-heading"><h2>Attachments</h2><span>{item.attachments.length}</span></div>{item.attachments.length === 0 ? <p className="side-empty">No attachments.</p> : <div className="attachment-list">{item.attachments.map((attachment) => { const src = endpoints.attachmentUrl(attachment.id); return <div className="attachment-item" key={attachment.id}><div className="attachment-title"><b>{attachment.file_name}</b><small>{(attachment.size_bytes / 1024 / 1024).toFixed(2)} MB{attachment.duration_seconds ? ` · ${attachment.duration_seconds}s` : ''}</small></div>{attachment.mime_type.startsWith('image/') ? <a href={src} target="_blank" rel="noreferrer"><img className="attachment-image" src={src} alt={attachment.file_name} loading="lazy" /></a> : attachment.mime_type.startsWith('video/') ? <Playback src={src} video /> : attachment.mime_type.startsWith('audio/') ? <Playback src={src} /> : attachment.mime_type === 'application/pdf' ? <PdfPreview src={src} title={attachment.file_name} /> : <a className="attachment-download" href={src} target="_blank" rel="noreferrer"><Download size={15} /> Open file</a>}</div> })}</div>}{user?.role !== 'Manager' && <label className="attachment-add button button-secondary">{upload.isPending ? 'Uploading…' : 'Add attachment'}<input type="file" hidden multiple accept="image/*,video/webm,video/mp4,audio/webm,audio/mp4,audio/mpeg,application/pdf" disabled={upload.isPending} onChange={(event) => { if (event.target.files?.length) upload.mutate(event.target.files); event.currentTarget.value = '' }} /></label>}</Card>
      <Card className="side-card workflow-card"><h2>Workflow</h2><div className="workflow-current"><span className={`workflow-dot status-${item.status.toLowerCase().replace(' ', '-')}`} /><div><b>{item.status}</b><small>Current status</small></div></div>{available.length > 0 && <><Field label={available.some(needsComment) ? 'Retest comment (required to verify/reopen)' : 'Transition comment (optional)'}><Textarea rows={3} value={transitionComment} maxLength={10000} onChange={(event) => setTransitionComment(event.target.value)} placeholder={available.some(needsComment) ? 'Describe what you retested or why it needs more work…' : 'Add a note for the history…'} /></Field><div className="workflow-buttons">{available.map((target) => <Button key={target} variant={target === 'Reopened' ? 'secondary' : 'primary'} disabled={transition.isPending} onClick={() => changeStatus(target)}>{target === 'Verified' ? <Check size={14} /> : target === 'Reopened' ? <RotateCcw size={14} /> : null}{transition.isPending ? 'Saving…' : target}</Button>)}</div></>}
        <div className="history-list"><h3>Status history</h3>{item.history.length === 0 ? <p className="side-empty">No transitions yet.</p> : [...item.history].reverse().map((entry) => <div className="history-entry" key={entry.id}><span className="history-line" /><div><b>{entry.from_status} → {entry.to_status}</b><small>{entry.user_name} · {new Date(entry.created_at).toLocaleString()}</small>{entry.note && <p>{entry.note}</p>}</div></div>)}</div>
      </Card>
    </aside></div>
  </>
}
