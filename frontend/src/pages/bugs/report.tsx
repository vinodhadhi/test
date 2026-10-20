import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Paperclip, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { endpoints, type Module, type Project, type User } from '../../api/client'
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from '../../components/ui'
import { Recorder, type RecordedFile } from './recording'

const schema = z.object({ project_id: z.coerce.number().int().positive('Choose a project'), module_id: z.coerce.number().int().positive('Choose a module'), title: z.string().trim().min(3, 'Add a descriptive title').max(300), steps: z.string().trim().min(1, 'Describe how to reproduce this issue'), expected_result: z.string().trim().min(1), actual_result: z.string().trim().min(1), severity: z.enum(['Critical', 'High', 'Medium', 'Low']), priority: z.string().trim().min(1).max(30), type: z.enum(['Frontend', 'Backend']), assigned_to: z.coerce.number().int().positive('Choose a developer'), environment: z.string().max(300), build_version: z.string().max(100) })
type Values = z.infer<typeof schema>
const MAX_BYTES = 25 * 1024 * 1024

export function ReportBugPage() {
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const projects = useQuery({ queryKey: ['my-projects'], queryFn: endpoints.myProjects })
  const [files, setFiles] = useState<File[]>([])
  const [recordings, setRecordings] = useState<RecordedFile[]>([])
  const [clientError, setClientError] = useState('')
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { severity: 'Medium', priority: 'Medium', type: 'Frontend', project_id: 0, module_id: 0, assigned_to: 0, environment: '', build_version: '' } })
  const [selectedProjectId, setSelectedProjectId] = useState(0)
  const modules = useQuery({ queryKey: ['my-modules', selectedProjectId], queryFn: () => endpoints.myModules(selectedProjectId), enabled: selectedProjectId > 0 })
  const developers = useQuery({ queryKey: ['project-developers', selectedProjectId], queryFn: () => endpoints.projectDevelopers(selectedProjectId), enabled: selectedProjectId > 0 })
  const projectField = register('project_id', { setValueAs: (value) => Number(value) || 0 })
  useEffect(() => () => recordings.forEach((recording) => URL.revokeObjectURL(recording.previewUrl)), [recordings])
  const allAttachments = useMemo(() => [...files, ...recordings.map((item) => item.file)], [files, recordings])
  const mutation = useMutation({ mutationFn: async (values: Values) => {
    const bug = await endpoints.createBug({ ...values, project_id: Number(values.project_id), module_id: Number(values.module_id), assigned_to: Number(values.assigned_to), environment: values.environment || null, build_version: values.build_version || null })
    try {
      for (const file of files) await endpoints.uploadAttachment(bug.id, file)
      for (const recording of recordings) await endpoints.uploadAttachment(bug.id, recording.file, recording.duration)
      return { bug }
    } catch (error) {
      return { bug, attachmentError: error instanceof Error ? error.message : 'An attachment could not be uploaded.' }
    }
  }, onSuccess: ({ bug, attachmentError }) => navigate(`/bugs/${bug.id}`, { replace: true, state: { notice: `Bug #${bug.bug_no} was reported.`, warning: attachmentError ? `The bug was saved, but an attachment did not upload: ${attachmentError}` : undefined } }), onError: (error: Error) => setClientError(error.message) })

  const addFiles = (incoming: FileList | null) => {
    setClientError('')
    if (!incoming) return
    const accepted = Array.from(incoming)
    const invalid = accepted.find((file) => file.size > MAX_BYTES || !(file.type.startsWith('image/') || ['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'application/pdf'].includes(file.type)))
    if (invalid) { setClientError(`${invalid.name} is unsupported or larger than 25 MB.`); return }
    setFiles((current) => [...current, ...accepted])
  }
  const projectError = projects.error ?? modules.error ?? developers.error
  return <>
    <PageHeader eyebrow="BUG TRACKING" title="Report a bug" description="Capture the details so your developer can reproduce and resolve it." action={<Link className="button button-secondary" to="/bugs"><ArrowLeft size={15} /> My bugs</Link>} />
    {clientError && <Notice>{clientError}</Notice>}{projectError && <Notice>{projectError.message}</Notice>}{mutation.isError && <Notice>{mutation.error.message}</Notice>}
    <Card className="report-card"><div className="report-section-head"><span>01</span><div><h2>Issue details</h2><p>Choose the project area and explain what went wrong.</p></div></div>
      <form className="report-form" onSubmit={handleSubmit((values) => { setClientError(''); mutation.mutate(values) })}>
        <div className="report-grid"><Field label="Project" error={errors.project_id?.message}><Select {...projectField} onChange={(event) => { projectField.onChange(event); setSelectedProjectId(Number(event.target.value) || 0); setValue('module_id', 0); setValue('assigned_to', 0) }} disabled={projects.isPending}><option value={0}>Select a project</option>{(projects.data ?? []).map((project: Project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field><Field label="Module" error={errors.module_id?.message ?? (modules.isError ? modules.error.message : undefined)}><Select {...register('module_id')} disabled={!selectedProjectId || modules.isPending || modules.isError || !modules.data?.length}><option value={0}>{!selectedProjectId ? 'Select a project first' : modules.isPending ? 'Loading modules…' : modules.isError ? 'Could not load modules' : !modules.data?.length ? 'No modules configured for this project' : 'Select a module'}</option>{(modules.data ?? []).map((module: Module) => <option key={module.id} value={module.id}>{module.name}</option>)}</Select></Field></div>
        <Field label="Issue title" error={errors.title?.message}><Input placeholder="Summarize the issue in a few words" maxLength={300} {...register('title')} /></Field>
        <Field label="Steps to reproduce" error={errors.steps?.message}><Textarea rows={4} placeholder={'1. Open the settings page\n2. Change the notification preference\n3. Select Save'} {...register('steps')} /></Field>
        <div className="report-grid"><Field label="Expected result" error={errors.expected_result?.message}><Textarea rows={3} placeholder="What should have happened?" {...register('expected_result')} /></Field><Field label="Actual result" error={errors.actual_result?.message}><Textarea rows={3} placeholder="What happened instead?" {...register('actual_result')} /></Field></div>
        <div className="report-grid report-grid-3"><Field label="Severity" error={errors.severity?.message}><Select {...register('severity')}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></Select></Field><Field label="Priority" error={errors.priority?.message}><Select {...register('priority')}><option>High</option><option>Medium</option><option>Low</option></Select></Field><Field label="Issue type" error={errors.type?.message}><Select {...register('type')}><option>Frontend</option><option>Backend</option></Select></Field><Field label="Assign developer" error={errors.assigned_to?.message}><Select {...register('assigned_to')} disabled={!selectedProjectId || developers.isPending}><option value={0}>{developers.isPending ? 'Loading team…' : 'Select developer'}</option>{(developers.data ?? []).map((developer: User) => <option key={developer.id} value={developer.id}>{developer.full_name}</option>)}</Select></Field></div>
        <div className="report-grid"><Field label="Environment (optional)"><Input placeholder="e.g. Chrome 128 · Windows 11" maxLength={300} {...register('environment')} /></Field><Field label="Build version (optional)"><Input placeholder="e.g. 2.4.1-beta" maxLength={100} {...register('build_version')} /></Field></div>
        <div className="report-divider" /><div className="report-section-head"><span>02</span><div><h2>Attachments</h2><p>Attach screenshots, recordings, and supporting files. 25 MB max per file.</p></div></div>
        <div className="upload-zone"><Paperclip size={17} /><div><b>Add screenshots, video, audio, or PDF</b><small>Images, WebM/MP4, MP3, PDF · Up to 25 MB each</small></div><label className="button button-secondary">Choose files<input type="file" hidden multiple accept="image/*,video/webm,video/mp4,audio/webm,audio/mp4,audio/mpeg,application/pdf" onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = '' }} /></label></div>
        {files.length > 0 && <div className="file-list">{files.map((file, index) => <div className="file-item" key={`${file.name}-${index}`}><Paperclip size={14} /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><Trash2 size={15} /></button></div>)}</div>}
        <Recorder onAdd={(recording) => setRecordings((current) => [...current, recording])} />
        {recordings.length > 0 && <div className="file-list">{recordings.map((recording, index) => <div className="file-item" key={recording.previewUrl}><Paperclip size={14} /><span>{recording.file.name}<small>{recording.duration}s · {(recording.file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" onClick={() => { URL.revokeObjectURL(recording.previewUrl); setRecordings((current) => current.filter((_, i) => i !== index)) }} aria-label={`Remove ${recording.file.name}`}><Trash2 size={15} /></button></div>)}</div>}
        {allAttachments.some((file) => file.size > MAX_BYTES) && <Notice>Each attachment must be 25 MB or smaller.</Notice>}<div className="report-submit"><span>Reported by {me.data?.full_name ?? 'you'} · Assigned developer will be notified in the workspace</span><Button type="submit" disabled={mutation.isPending || allAttachments.some((file) => file.size > MAX_BYTES)}>{mutation.isPending ? 'Submitting…' : 'Submit bug'} <Send size={14} /></Button></div>
      </form>
    </Card>
  </>
}
