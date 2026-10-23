import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Boxes, CircleCheck, CircleDot, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { endpoints } from '../../api/client'
import { Card, PageHeader } from '../../components/ui'

export function AdminOverview() {
  const users = useQuery({ queryKey: ['users'], queryFn: endpoints.users })
  const projects = useQuery({ queryKey: ['projects'], queryFn: endpoints.projects })
  const error = users.error ?? projects.error
  if (error) return <><PageHeader eyebrow="ADMINISTRATION" title="Overview" description="Manage your QA workspace." /><Card><p className="error-copy">{error.message}</p><button className="link-button" onClick={() => { users.refetch(); projects.refetch() }}>Try again</button></Card></>
  const userCount = users.data?.length ?? 0
  const activeCount = users.data?.filter((user) => user.is_active).length ?? 0
  const projectCount = projects.data?.length ?? 0
  const teamRoles = ['Admin', 'Manager', 'Tester', 'Developer'] as const
  const teamBreakdown = teamRoles.map((role) => ({ role, count: users.data?.filter((user) => user.role === role).length ?? 0 }))
  return <>
    <PageHeader eyebrow="ADMINISTRATION" title="Overview" description="Your workspace at a glance." />
    {(users.isPending || projects.isPending) ? <div className="loading-row">Loading workspace…</div> : <>
      <div className="metric-grid">
        <Card className="metric-card"><div className="metric-top"><span>Total users</span><UsersRound size={18} /></div><strong>{userCount}</strong><small>{activeCount} active accounts</small></Card>
        <Card className="metric-card"><div className="metric-top"><span>Projects</span><Boxes size={18} /></div><strong>{projectCount}</strong><small>Configured workspaces</small></Card>
        <Card className="metric-card"><div className="metric-top"><span>Active accounts</span><CircleCheck size={18} /></div><strong>{activeCount}</strong><small>Ready to collaborate</small></Card>
        <Card className="metric-card"><div className="metric-top"><span>System status</span><CircleDot size={18} /></div><strong className="healthy-value">Healthy</strong><small><i className="status-dot" /> API connected</small></Card>
      </div>
      <section className="panel team-composition" aria-label="Team composition"><div className="panel-heading"><div><h2>Team composition</h2><p>Accounts by role across your workspace</p></div><strong>{userCount} people</strong></div><div className="team-composition-body"><div className="team-composition-track" role="img" aria-label={teamBreakdown.map(item => `${item.role}: ${item.count}`).join(', ')}>{teamBreakdown.filter(item => item.count > 0).map(item => <span key={item.role} className={`team-segment team-segment-${item.role.toLowerCase()}`} style={{ width: `${userCount ? item.count / userCount * 100 : 0}%` }} />)}</div><div className="team-composition-legend">{teamBreakdown.map(item => <div key={item.role}><span className={`team-legend-dot team-segment-${item.role.toLowerCase()}`} /><span>{item.role}s</span><b>{item.count}</b></div>)}</div></div></section>
      <div className="overview-grid"><Card className="welcome-card"><div className="eyebrow">GET STARTED</div><h2>Set up your QA workspace</h2><p className="muted">Add the people on your team, then create a project and its modules. You can assign testers and developers to each project.</p><div className="welcome-actions"><Link className="button button-primary" to="/admin/users">Manage users <ArrowRight size={15} /></Link><Link className="button button-secondary" to="/admin/projects">Set up projects <ArrowRight size={15} /></Link></div></Card><Card className="activity-card"><div className="card-heading"><div><h3>Workspace checklist</h3><p>Keep your QA setup moving</p></div></div><div className="check-row"><span className={userCount ? 'check-icon done' : 'check-icon'}>{userCount ? '✓' : '1'}</span><div><b>Add team members</b><small>{userCount ? `${userCount} account${userCount === 1 ? '' : 's'} created` : 'Create tester and developer accounts'}</small></div><Link to="/admin/users" aria-label="Manage users">→</Link></div><div className="check-row"><span className={projectCount ? 'check-icon done' : 'check-icon'}>{projectCount ? '✓' : '2'}</span><div><b>Create your first project</b><small>{projectCount ? `${projectCount} project${projectCount === 1 ? '' : 's'} configured` : 'Add a project and define its modules'}</small></div><Link to="/admin/projects" aria-label="Manage projects">→</Link></div></Card></div>
    </>}
  </>
}
