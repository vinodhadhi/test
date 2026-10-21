import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, RotateCcw, Search, UsersRound } from 'lucide-react'
import { endpoints } from '../../api/client'
import { Button, Card, Notice, PageHeader } from '../../components/ui'
import { TeamWorkloadList } from './team-workload'
import { TeamRolePicker } from './team-role-picker'

export function ManagerTeamPage() {
  const client = useQueryClient()
  const projects = useQuery({ queryKey: ['manager-projects'], queryFn: endpoints.managerProjects })
  const users = useQuery({ queryKey: ['manager-assignable-users'], queryFn: endpoints.managerUsers })
  const workload = useQuery({ queryKey: ['manager-team-workload'], queryFn: endpoints.managerTeamWorkload })
  const [projectId, setProjectId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [savedIds, setSavedIds] = useState<number[]>([])
  const [testerId, setTesterId] = useState('')
  const [developerId, setDeveloperId] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'All' | 'Tester' | 'Developer'>('All')
  const members = useQuery({
    queryKey: ['manager-project-members', projectId],
    queryFn: () => endpoints.managerMembers(projectId!),
    enabled: projectId !== null,
  })
  const save = useMutation({
    mutationFn: () => endpoints.managerSetMembers(projectId!, selected),
    onSuccess: (members) => {
      const ids = members.map((user) => user.id)
      setSavedIds(ids)
      setSelected(ids)
      client.invalidateQueries({ queryKey: ['manager-project-members', projectId] })
      client.invalidateQueries({ queryKey: ['manager-team-workload'] })
      client.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  useEffect(() => {
    if (members.data) {
      const ids = members.data.map((user) => user.id)
      setSavedIds(ids)
      setSelected(ids)
    }
  }, [members.data])

  const available = users.data ?? []
  const hasChanges = selected.length !== savedIds.length || selected.some((id) => !savedIds.includes(id))
  const selectedTesters = available.filter((user) => user.role === 'Tester' && selected.includes(user.id)).length
  const selectedDevelopers = available.filter((user) => user.role === 'Developer' && selected.includes(user.id)).length
  const visibleUsers = available.filter((user) => (roleFilter === 'All' || user.role === roleFilter) && `${user.full_name} ${user.user_id}`.toLowerCase().includes(search.trim().toLowerCase()))
  const addMember = (userId: number) => { save.reset(); setSelected((current) => current.includes(userId) ? current : [...current, userId]) }
  const removeMember = (userId: number) => { save.reset(); setSelected((current) => current.filter((id) => id !== userId)) }
  const optionsFor = (role: 'Tester' | 'Developer') => available.filter((user) => user.role === role && !selected.includes(user.id))

  return <>
    <PageHeader eyebrow="WORKSPACE" title="Team assignments" description="Compare current projects, past assignments, and issue workload before assigning testers and developers." />
    {projects.isError && <Notice>{projects.error.message}</Notice>}
    {users.isError && <Notice>{users.error.message}</Notice>}
    {workload.isError && <Notice>{workload.error.message}</Notice>}
    {members.isError && <Notice>{members.error.message}</Notice>}
    {save.isSuccess && <Notice tone="success">Project team saved.</Notice>}
    {save.isError && <Notice>{save.error.message}</Notice>}
    <Card className="form-card">
      <div className="card-heading"><div><h3>Select a project</h3><p>Assignments control who can report and work on project bugs.</p></div></div>
      {projects.isPending ? <div className="loading-row">Loading projects…</div> : projects.data?.length ? <select className="input" aria-label="Project" value={projectId ?? ''} disabled={save.isPending} onChange={(event) => { if (hasChanges && !window.confirm('Discard unsaved team changes?')) return; setProjectId(event.target.value ? Number(event.target.value) : null); setSelected([]); setSavedIds([]); setTesterId(''); setDeveloperId(''); save.reset() }}><option value="">Choose a project</option>{projects.data.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select> : <p className="muted">Create a project first in Projects &amp; modules.</p>}
    </Card>
    {projectId !== null && <Card className="table-card"><div className="table-toolbar"><div><h3><UsersRound size={16} /> Assign testers and developers</h3><p>{selected.length} selected</p></div></div>
      {members.isError || users.isError || workload.isError ? <div className="assignment-empty">Team information could not be loaded. <Button variant="secondary" onClick={() => { members.refetch(); users.refetch(); workload.refetch() }}>Retry</Button></div> : members.isPending || users.isPending || workload.isPending ? <div className="loading-row">Loading team…</div> : available.length ? <><div className="assignment-summary"><span><b>{selectedTesters}</b> testers</span><span><b>{selectedDevelopers}</b> developers</span><span className={hasChanges ? 'assignment-draft' : 'assignment-saved'}>{hasChanges ? 'Unsaved changes' : 'Up to date'}</span></div><div className="team-role-pickers"><TeamRolePicker role="Tester" users={optionsFor('Tester')} value={testerId} onChange={setTesterId} onAdd={addMember} /><TeamRolePicker role="Developer" users={optionsFor('Developer')} value={developerId} onChange={setDeveloperId} onAdd={addMember} /></div><div className="assignment-filters"><label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team members" aria-label="Search team members" /></label><select className="input" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'All' | 'Tester' | 'Developer')} aria-label="Filter team by role"><option>All</option><option>Tester</option><option>Developer</option></select></div>{visibleUsers.length ? <TeamWorkloadList users={visibleUsers} workload={workload.data ?? []} selected={selected} projectId={projectId} onAdd={addMember} onRemove={removeMember} /> : <p className="assignment-empty">No team members match this filter.</p>}<div className="form-actions assignment-actions"><Button variant="secondary" onClick={() => { setSelected(savedIds); save.reset() }} disabled={!hasChanges || save.isPending}><RotateCcw size={15} /> Reset</Button><Button onClick={() => save.mutate()} disabled={!hasChanges || save.isPending}><Check size={15} /> {save.isPending ? 'Saving…' : 'Save assignments'}</Button></div></> : <p className="empty-state">No active tester or developer accounts are available. Create them from Create team accounts.</p>}
    </Card>}
  </>
}
