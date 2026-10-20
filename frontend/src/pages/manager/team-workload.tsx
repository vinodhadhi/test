import type { TeamWorkload, User } from '../../api/client'
import { Button } from '../../components/ui'

export function TeamWorkloadList({ users, workload, selected, projectId, onAdd, onRemove }: { users: User[]; workload: TeamWorkload[]; selected: number[]; projectId: number; onAdd: (userId: number) => void; onRemove: (userId: number) => void }) {
  const byId = new Map(workload.map((entry) => [entry.user_id, entry]))
  return <><div className="team-workload-list">{users.map((user) => {
    const entry = byId.get(user.id)
    const alreadyOnProject = entry?.current_projects.some((project) => project.id === projectId)
    const chosen = selected.includes(user.id)
    return <div className={`team-workload-row ${chosen ? 'team-workload-selected' : ''}`} key={user.id}>
      <div className="team-workload-person"><b>{user.full_name}</b><span>{user.role}{alreadyOnProject ? ' · Already on this project' : ''}</span></div>
      <div className="team-workload-projects"><b>Current projects ({entry?.current_projects.length ?? 0})</b><span>{entry?.current_projects.map((project) => project.name).join(', ') || 'None'}</span><b>Previously assigned</b><span>{entry?.past_projects.map((project) => project.name).join(', ') || 'None recorded'}</span>{!!entry?.other_project_work.length && <small>Earlier issue work: {entry.other_project_work.map((project) => project.name).join(', ')}</small>}</div>
      <div className="team-workload-count"><strong>{entry?.active_issues ?? 0}</strong><span>active issues</span>{user.role === 'Tester' && <small>{entry?.to_retest ?? 0} to retest</small>}<small>{entry?.total_issues ?? 0} total issues</small></div>
      <Button type="button" variant="secondary" onClick={() => chosen ? onRemove(user.id) : onAdd(user.id)}>{chosen ? 'Remove' : 'Add'}</Button>
    </div>
  })}</div><p className="team-workload-note">Counts reflect current issue statuses. Assignment history starts now; older issue work appears separately where available.</p></>
}
