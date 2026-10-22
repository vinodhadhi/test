import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Check, ChevronDown, FolderKanban, Plus, Trash2, UsersRound, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { endpoints, type Module, type Project, type User } from '../../api/client'
import { Button, Card, Field, Input, Notice, PageHeader, Textarea } from '../../components/ui'
import { ProjectLifecyclePanel } from '../manager/project-lifecycle'

const projectSchema = z.object({ name: z.string().trim().min(1, 'Enter a project name').max(200), description: z.string().max(5000) })
type ProjectValues = z.infer<typeof projectSchema>

export function ProjectsPage({ managerMode = false }: { managerMode?: boolean }) {
  const client = useQueryClient()
  const projectsQuery = managerMode ? ['manager-projects'] : ['projects']
  const projects = useQuery({ queryKey: projectsQuery, queryFn: managerMode ? endpoints.managerProjects : endpoints.projects })
  const form = useForm<ProjectValues>({ resolver: zodResolver(projectSchema), defaultValues: { name: '', description: '' } })
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('success')
  const showError = (message: string) => { setNoticeTone('error'); setNotice(message) }
  const invalidate = () => client.invalidateQueries({ queryKey: projectsQuery })
  const create = useMutation({ mutationFn: managerMode ? endpoints.managerCreateProject : endpoints.createProject, onSuccess: () => { invalidate(); form.reset(); setCreating(false); setNoticeTone('success'); setNotice('Project created.') } })
  const submitProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice('')
    form.clearErrors()

    // Read the DOM values on submit so browser autofill is included even when
    // it did not dispatch input/change events for React Hook Form.
    const values = new FormData(event.currentTarget)
    const result = projectSchema.safeParse({
      name: String(values.get('name') ?? ''),
      description: String(values.get('description') ?? ''),
    })
    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'name' || issue.path[0] === 'description') {
          form.setError(issue.path[0], { type: 'manual', message: issue.message })
        }
      }
      return
    }
    create.mutate(result.data)
  }
  return <>
    <PageHeader eyebrow="WORKSPACE" title="Projects & modules" description="Define project spaces, their modules, and the people responsible for QA." action={<Button type="button" onClick={() => { setNotice(''); setCreating((v) => !v) }}><Plus size={16} /> New project</Button>} />
    {notice && <Notice tone={noticeTone}>{notice}</Notice>}
    {projects.error && <Notice>{projects.error.message}</Notice>}
    {create.error && <Notice>{create.error.message}</Notice>}
    {creating && <Card className="form-card"><div className="card-heading"><div><h3>Create project</h3><p>Projects organize bugs, modules, and team membership.</p></div><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Close</Button></div><form className="form-grid project-form" onSubmit={submitProject}><Field label="Project name" error={form.formState.errors.name?.message}><Input autoFocus placeholder="e.g. Admin Portal" {...form.register('name')} /></Field><Field label="Description" error={form.formState.errors.description?.message}><Textarea placeholder="What is this project for?" rows={3} {...form.register('description')} /></Field><div className="form-actions"><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create project'}</Button></div></form></Card>}
    {projects.isPending ? <div className="loading-row">Loading projects…</div> : projects.isError ? <Card className="empty-state"><FolderKanban /><b>Could not load projects</b><Button variant="secondary" onClick={() => projects.refetch()}>Retry</Button></Card> : projects.data.length === 0 ? <Card className="empty-state"><FolderKanban /><b>No projects yet</b><span>Create your first project, then add modules and assign the QA team.</span><Button onClick={() => setCreating(true)}><Plus size={15} /> Create project</Button></Card> : <div className="project-list">{projects.data.map((project) => <ProjectCard key={project.id} project={project} managerMode={managerMode} onChanged={() => { invalidate(); setNoticeTone('success'); setNotice('Project updated.') }} onError={showError} />)}</div>}
  </>
}

function ProjectCard({ project, managerMode, onChanged, onError }: { project: Project; managerMode: boolean; onChanged: () => void; onError: (message: string) => void }) {
  const client = useQueryClient()
  const cachePrefix = managerMode ? 'manager-' : ''
  const modules = useQuery({ queryKey: [cachePrefix + 'modules', project.id], queryFn: () => managerMode ? endpoints.managerModules(project.id) : endpoints.modules(project.id) })
  const users = useQuery({ queryKey: [cachePrefix + 'assignable-users'], queryFn: managerMode ? endpoints.managerUsers : endpoints.users, enabled: !managerMode })
  const members = useQuery({ queryKey: [cachePrefix + 'project-members', project.id], queryFn: () => managerMode ? endpoints.managerMembers(project.id) : endpoints.projectMembers(project.id), enabled: !managerMode })
  const [moduleName, setModuleName] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editingMembers, setEditingMembers] = useState(false)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [selected, setSelected] = useState<number[]>([])
  const addModule = useMutation({ mutationFn: () => managerMode ? endpoints.managerCreateModule(project.id, moduleName.trim()) : endpoints.createModule(project.id, moduleName.trim()), onSuccess: () => { client.invalidateQueries({ queryKey: [cachePrefix + 'modules', project.id] }); setModuleName(''); onChanged() }, onError: (e: Error) => onError(e.message) })
  const removeModule = useMutation({ mutationFn: (moduleId: number) => managerMode ? endpoints.managerDeleteModule(project.id, moduleId) : endpoints.deleteModule(project.id, moduleId), onSuccess: () => { client.invalidateQueries({ queryKey: [cachePrefix + 'modules', project.id] }); onChanged() }, onError: (e: Error) => onError(e.message) })
  const update = useMutation({ mutationFn: () => managerMode ? endpoints.managerUpdateProject(project.id, { name: name.trim(), description: description.trim() }) : endpoints.updateProject(project.id, { name: name.trim(), description: description.trim() }), onSuccess: () => { client.invalidateQueries({ queryKey: [cachePrefix + 'projects'] }); client.invalidateQueries({ queryKey: ['projects'] }); setEditing(false); onChanged() }, onError: (e: Error) => onError(e.message) })
  const remove = useMutation({ mutationFn: () => endpoints.deleteProject(project.id), onSuccess: () => { client.invalidateQueries({ queryKey: ['projects'] }); onChanged() }, onError: (e: Error) => onError(e.message) })
  const saveMembers = useMutation({ mutationFn: () => managerMode ? endpoints.managerSetMembers(project.id, selected) : endpoints.members(project.id, selected), onSuccess: () => { client.invalidateQueries({ queryKey: [cachePrefix + 'project-members', project.id] }); setEditingMembers(false); onChanged() }, onError: (e: Error) => onError(e.message) })
  const available = (users.data ?? []).filter((u) => u.is_active && ['Tester', 'Developer'].includes(u.role))
  const chosen = members.data?.map((u) => u.id) ?? []
  const toggleMember = (id: number) => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  const startMemberEdit = () => { setSelected(chosen); setEditing(false); setEditingMembers(true) }
  return <Card className="project-card">
    <div className="project-card-top"><button className="project-collapse" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Collapse project' : 'Expand project'}><span className="project-symbol"><FolderKanban size={19} /></span></button><div className="project-title-wrap">{editing ? <input className="project-name-edit" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" /> : <h2>{project.name}</h2>}<p>{project.description || 'No description added'}</p></div><div className="project-card-actions">{editing ? <><Button variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel edit"><X size={16} /></Button><Button variant="secondary" onClick={() => update.mutate()} disabled={!name.trim() || update.isPending}><Check size={15} /> Save</Button></> : <><Button variant="ghost" onClick={() => { setName(project.name); setDescription(project.description ?? ""); setExpanded(true); setEditing(true) }}>Edit</Button>{!managerMode && <Button variant="ghost" className="danger-text" onClick={() => { if (window.confirm(`Delete “${project.name}”?`)) remove.mutate() }} aria-label={`Delete ${project.name}`}><Trash2 size={16} /></Button>}</>}<Button variant="ghost" className="icon-button" aria-label="Toggle project details" onClick={() => setExpanded((v) => !v)}><ChevronDown className={expanded ? '' : 'chevron-closed'} size={17} /></Button></div></div>
    {expanded && <div className="project-body">
      {managerMode && <ProjectLifecyclePanel project={project} />}
      {editing && <Field label="Description"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the project" /></Field>}
      <div className="project-sections"><section className="project-section"><div className="section-heading"><div><h3><Boxes size={15} /> Modules</h3><span>{modules.data?.length ?? 0} defined</span></div></div>{modules.isPending ? <div className="loading-row compact">Loading modules…</div> : modules.isError ? <div className="inline-error">{modules.error.message}</div> : <div className="module-list">{modules.data.length ? modules.data.map((module: Module) => <span className="module-chip" key={module.id}>{module.name}<button onClick={() => removeModule.mutate(module.id)} aria-label={`Remove ${module.name} module`} title="Remove module"><X size={13} /></button></span>) : <span className="muted">No modules defined.</span>}</div>}<form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (moduleName.trim()) addModule.mutate() }}><Input value={moduleName} onChange={(e) => setModuleName(e.target.value)} placeholder="Add a module" maxLength={200} /><Button type="submit" variant="secondary" disabled={!moduleName.trim() || addModule.isPending}><Plus size={15} /> Add</Button></form></section>
        {!managerMode && <section className="project-section team-section"><div className="section-heading"><div><h3><UsersRound size={15} /> Project team</h3><span>{members.data?.length ?? 0} assigned</span></div>{members.isSuccess && <Button variant="ghost" onClick={() => editingMembers ? setEditingMembers(false) : startMemberEdit()}>{editingMembers ? 'Cancel' : 'Edit team'}</Button>}</div>{members.isPending ? <div className="loading-row compact">Loading team…</div> : members.isError ? <div className="inline-error">{members.error.message}</div> : !editingMembers ? <div className="team-list">{members.data.map((member) => <span className="team-member" key={member.id}><span className="avatar avatar-tiny">{member.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>{member.full_name}<small>{member.role}</small></span>)}{!members.data.length && <span className="muted">No testers or developers assigned.</span>}</div> : <div className="member-editor"><div className="member-options">{available.length ? available.map((user: User) => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggleMember(user.id)} /><span>{user.full_name}</span><small>{user.role}</small></label>) : <p className="muted">No active testers or developers exist yet. An Admin must create their accounts first.</p>}</div><Button variant="secondary" onClick={() => saveMembers.mutate()} disabled={saveMembers.isPending}><Check size={14} /> Save team</Button></div>}</section>}
      </div>
    </div>}
  </Card>
}
