import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, UsersRound } from 'lucide-react'
import { endpoints } from '../../api/client'
import { Button, Card, Notice, PageHeader } from '../../components/ui'

export function ManagerTeamPage() {
  const client = useQueryClient()
  const projects = useQuery({ queryKey: ['manager-projects'], queryFn: endpoints.managerProjects })
  const users = useQuery({ queryKey: ['manager-assignable-users'], queryFn: endpoints.managerUsers })
  const [projectId, setProjectId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const members = useQuery({
    queryKey: ['manager-project-members', projectId],
    queryFn: () => endpoints.managerMembers(projectId!),
    enabled: projectId !== null,
  })
  const save = useMutation({
    mutationFn: () => endpoints.managerSetMembers(projectId!, selected),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['manager-project-members', projectId] })
      client.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  useEffect(() => {
    if (members.data) setSelected(members.data.map((user) => user.id))
  }, [members.data])

  const available = users.data ?? []
  const toggle = (userId: number) => setSelected((current) => current.includes(userId)
    ? current.filter((id) => id !== userId)
    : [...current, userId])

  return <>
    <PageHeader eyebrow="WORKSPACE" title="Team assignments" description="Assign existing testers and developers to a project." />
    {projects.isError && <Notice>{projects.error.message}</Notice>}
    {users.isError && <Notice>{users.error.message}</Notice>}
    {members.isError && <Notice>{members.error.message}</Notice>}
    {save.isSuccess && <Notice tone="success">Project team saved.</Notice>}
    {save.isError && <Notice>{save.error.message}</Notice>}
    <Card className="form-card">
      <div className="card-heading"><div><h3>Select a project</h3><p>Assignments control who can report and work on project bugs.</p></div></div>
      {projects.isPending ? <div className="loading-row">Loading projects…</div> : projects.data?.length ? <select className="input" aria-label="Project" value={projectId ?? ''} onChange={(event) => { setProjectId(event.target.value ? Number(event.target.value) : null); setSelected([]); save.reset() }}><option value="">Choose a project</option>{projects.data.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select> : <p className="muted">Create a project first in Projects &amp; modules.</p>}
    </Card>
    {projectId !== null && <Card className="table-card"><div className="table-toolbar"><div><h3><UsersRound size={16} /> Assign testers and developers</h3><p>{selected.length} selected</p></div></div>
      {members.isPending || users.isPending ? <div className="loading-row">Loading team…</div> : available.length ? <><div className="member-options">{available.map((user) => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} /><span>{user.full_name}</span><small>{user.role}</small></label>)}</div><div className="form-actions"><Button onClick={() => save.mutate()} disabled={save.isPending}><Check size={15} /> {save.isPending ? 'Saving…' : 'Save assignments'}</Button></div></> : <p className="empty-state">No active tester or developer accounts are available. Create them from Create team accounts.</p>}
    </Card>}
  </>
}
