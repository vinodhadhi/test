import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Paperclip, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { endpoints, type Module, type Project, type User } from '../../api/client'
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from '../../components/ui'

const schema = z.object({ project_id: z.coerce.number().int().positive('Choose a project'), module_id: z.coerce.number().int().positive('Choose a module'), title: z.string().trim().min(3, 'Add a descriptive title').max(300), steps: z.string().trim().min(1, 'Describe how to reproduce this issue'), expected_result: z.string().trim().min(1), actual_result: z.string().trim().min(1), severity: z.enum(['Critical', 'High', 'Medium', 'Low']), priority: z.string().trim().min(1).max(30), type: z.enum(['Frontend', 'Backend']), assigned_to: z.coerce.number().int().positive('Choose a developer'), environment: z.string().max(300), build_version: z.string().max(100), reference_url: z.string().max(2048).refine((value) => !value || (z.string().url().safeParse(value).success && /^https?:\/\//i.test(value)), 'Enter an HTTP or HTTPS link') })
type Values = z.infer<typeof schema>
const MAX_BYTES = 25 * 1024 * 1024
const VIDEO_TYPES = new Set(['video/webm', 'video/mp4'])

function WorkflowVideoPreview({ file }: { file: File }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return src ? <video className="workflow-video-preview" controls preload="metadata" src={src} aria-label={`Preview ${file.name}`} /> : null
}

export function ReportBugPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const projects = useQuery({ queryKey: ['my-projects'], queryFn: endpoints.myProjects })
  const [files, setFiles] = useState<File[]>([])
  const [clientError, setClientError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { severity: 'Medium', priority: 'Medium', type: 'Frontend', project_id: 0, module_id: 0, assigned_to: 0, environment: '', build_version: '', reference_url: '' } })
  const [selectedProjectId, setSelectedProjectId] = useState(0)
  const modules = useQuery({ queryKey: ['my-modules', selectedProjectId], queryFn: () => endpoints.myModules(selectedProjectId), enabled: selectedProjectId > 0 })
  const developers = useQuery({ queryKey: ['project-developers', selectedProjectId], queryFn: () => endpoints.projectDevelopers(selectedProjectId), enabled: selectedProjectId > 0 })
  const projectField = register('project_id', { setValueAs: (value) => Number(value) || 0 })
  const mutation = useMutation({ mutationFn: async (values: Values) => {
    const bug = await endpoints.createBug({ ...values, project_id: Number(values.project_id), module_id: Number(values.module_id), assigned_to: Number(values.assigned_to), environment: values.environment || null, build_version: values.build_version || null, reference_url: values.reference_url || null })
    const failedFiles: { name: string; reason: string }[] = []
    setUploadProgress({ completed: 0, total: files.length })
    for (const [index, file] of files.entries()) {
      try { await endpoints.uploadAttachment(bug.id, file) }
      catch (error) { failedFiles.push({ name: file.name, reason: error instanceof Error ? error.message : 'Upload failed' }) }
      setUploadProgress({ completed: index + 1, total: files.length })
    }
    return { bug, failedFiles }
  }, onSuccess: ({ bug, failedFiles }) => { client.invalidateQueries({ queryKey: ['dashboard'] }); client.invalidateQueries({ queryKey: ['bugs'] }); navigate(`/bugs/${bug.id}`, { replace: true, state: { notice: `Bug #${bug.bug_no} was reported.`, warning: failedFiles.length ? `${failedFiles.length} attachment${failedFiles.length === 1 ? '' : 's'} could not be uploaded (${failedFiles.map((file) => file.name).join(', ')}): ${failedFiles[0].reason}. You can retry from this issue page.` : undefined } }) }, onError: (error: Error) => setClientError(error.message) })

  const addFiles = (incoming: FileList | null, kind: 'support' | 'video') => {
    setClientError('')
    if (!incoming) return
    const accepted = Array.from(incoming).map((file) => {
      if (kind !== 'video' || file.type) return file
      const extension = file.name.toLowerCase().split('.').pop()
      const mime = extension === 'mp4' ? 'video/mp4' : extension === 'webm' ? 'video/webm' : ''
      return mime ? new File([file], file.name, { type: mime, lastModified: file.lastModified }) : file
    })
    const invalid = accepted.find((file) => file.size > MAX_BYTES || (kind === 'video' ? !VIDEO_TYPES.has(file.type) : !(file.type.startsWith('image/') || file.type === 'application/pdf')))
    if (invalid) { setClientError(`${invalid.name} is unsupported or larger than 25 MB.`); return }
    setFiles((current) => [...current, ...accepted])
  }
  const projectError = projects.error ?? modules.error ?? developers.error
  return <>
    <PageHeader eyebrow="BUG TRACKING" title="Report a bug" description="Capture the details so your developer can reproduce and resolve it." action={<Link className="button button-secondary" to="/bugs"><ArrowLeft size={15} /> My bugs</Link>} />
    {clientError && <Notice>{clientError}</Notice>}{projectError && <Notice>{projectError.message} <Button type="button" variant="secondary" onClick={() => { projects.refetch(); if (selectedProjectId) { modules.refetch(); developers.refetch() } }}>Retry loading</Button></Notice>}{projects.isSuccess && !projects.data.length && <Notice tone="info">{me.data?.role === 'Admin' ? 'Create a project and assign a developer before reporting a bug.' : 'No projects are available to you yet. Ask a manager to assign you to a project.'}</Notice>}{mutation.isError && <Notice>{mutation.error.message}</Notice>}
    <Card className="report-card"><div className="report-section-head"><span>01</span><div><h2>Issue details</h2><p>Choose the project area and explain what went wrong.</p></div></div>
      <form className="report-form" onSubmit={handleSubmit((values) => { setClientError(''); setUploadProgress(null); mutation.mutate(values) })}>
        <div className="report-grid"><Field label="Project" error={errors.project_id?.message}><Select {...projectField} onChange={(event) => { projectField.onChange(event); setSelectedProjectId(Number(event.target.value) || 0); setValue('module_id', 0); setValue('assigned_to', 0) }} disabled={projects.isPending}><option value={0}>Select a project</option>{(projects.data ?? []).map((project: Project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field><Field label="Module" error={errors.module_id?.message ?? (modules.isError ? modules.error.message : undefined)}><Select {...register('module_id')} disabled={!selectedProjectId || modules.isPending || modules.isError || !modules.data?.length}><option value={0}>{!selectedProjectId ? 'Select a project first' : modules.isPending ? 'Loading modules…' : modules.isError ? 'Could not load modules' : !modules.data?.length ? 'No modules configured for this project' : 'Select a module'}</option>{(modules.data ?? []).map((module: Module) => <option key={module.id} value={module.id}>{module.name}</option>)}</Select></Field></div>
        <Field label="Issue title" error={errors.title?.message}><Input placeholder="Summarize the issue in a few words" maxLength={300} {...register('title')} /></Field>
        <Field label="Steps to reproduce" error={errors.steps?.message}><Textarea rows={4} placeholder={'1. Open the settings page\n2. Change the notification preference\n3. Select Save'} {...register('steps')} /></Field>
        <div className="report-grid"><Field label="Expected result" error={errors.expected_result?.message}><Textarea rows={3} placeholder="What should have happened?" {...register('expected_result')} /></Field><Field label="Actual result" error={errors.actual_result?.message}><Textarea rows={3} placeholder="What happened instead?" {...register('actual_result')} /></Field></div>
        <div className="report-grid report-grid-3"><Field label="Severity" error={errors.severity?.message}><Select {...register('severity')}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></Select></Field><Field label="Priority" error={errors.priority?.message}><Select {...register('priority')}><option>High</option><option>Medium</option><option>Low</option></Select></Field><Field label="Issue type" error={errors.type?.message}><Select {...register('type')}><option>Frontend</option><option>Backend</option></Select></Field><Field label="Assign developer" error={errors.assigned_to?.message}><Select {...register('assigned_to')} disabled={!selectedProjectId || developers.isPending || developers.isError || !developers.data?.length}><option value={0}>{developers.isPending ? 'Loading team…' : 'Select developer'}</option>{(developers.data ?? []).map((developer: User) => <option key={developer.id} value={developer.id}>{developer.full_name}</option>)}</Select></Field></div>
        <div className="report-grid"><Field label="Environment (optional)"><Input placeholder="e.g. Chrome 128 · Windows 11" maxLength={300} {...register('environment')} /></Field><Field label="Build version (optional)"><Input placeholder="e.g. 2.4.1-beta" maxLength={100} {...register('build_version')} /></Field></div>
        <Field label="Reference link (optional)" error={errors.reference_url?.message}><Input type="url" placeholder="https://example.com/api/issues/123" maxLength={2048} {...register('reference_url')} /></Field>
        <div className="report-divider" /><div className="report-section-head"><span>02</span><div><h2>Evidence</h2><p>Upload screenshots, a workflow video, or a PDF. Up to 25 MB per file.</p></div></div>
        <div className="upload-zone"><Paperclip size={17} /><div><b>Screenshots and PDF</b><small>Images or PDF · Up to 25 MB each</small></div><label className="button button-secondary">Choose files<input type="file" hidden multiple accept="image/*,application/pdf" onChange={(event) => { addFiles(event.target.files, 'support'); event.currentTarget.value = '' }} /></label></div>
        <div className="upload-zone"><Paperclip size={17} /><div><b>Upload workflow video</b><small>MP4 or WebM · Up to 25 MB each</small></div><label className="button button-secondary">Choose video<input type="file" hidden multiple accept="video/mp4,video/webm" onChange={(event) => { addFiles(event.target.files, 'video'); event.currentTarget.value = '' }} /></label></div>
        {files.length > 0 && <div className="file-list">{files.map((file, index) => <div className="file-item file-item-preview" key={`${file.name}-${index}`}><div className="file-item-details"><Paperclip size={14} /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><Trash2 size={15} /></button></div>{VIDEO_TYPES.has(file.type) && <WorkflowVideoPreview file={file} />}</div>)}</div>}
        <div className="report-submit"><span>{mutation.isPending && uploadProgress?.total ? `Uploading evidence ${uploadProgress.completed} of ${uploadProgress.total}…` : `Reported by ${me.data?.full_name ?? 'you'} · Assigned developer will be notified in the workspace`}</span><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Submitting…' : 'Submit bug'} <Send size={14} /></Button></div>
      </form>
    </Card>
  </>
}
