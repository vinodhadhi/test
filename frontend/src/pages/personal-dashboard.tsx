import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowUpRight, BadgeCheck, Bug, CircleDot, FolderKanban, Plus, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { endpoints } from '../api/client'
import { Button } from '../components/ui'

export function PersonalDashboardPage() {
  const dashboard = useQuery({ queryKey: ['dashboard', 'me'], queryFn: endpoints.personalDashboard })
  if (dashboard.isPending) return <div className="page-center"><div className="spinner" aria-label="Loading dashboard" /></div>
  if (dashboard.isError) return <div className="notice notice-error" role="alert">{dashboard.error.message} <Button variant="secondary" onClick={() => dashboard.refetch()}>Try again</Button></div>

  const data = dashboard.data
  const isTester = data.role === 'Tester'
  const completed = isTester ? data.verified : data.fixed + data.verified
  const completion = data.total ? Math.round(completed / data.total * 100) : 0
  const nextCount = isTester ? data.fixed : data.open + data.reopened
  const cards = isTester ? [
    { label: 'Assigned projects', value: data.assigned_projects, icon: FolderKanban, tone: 'blue' },
    { label: 'Bugs reported', value: data.total, icon: Bug, tone: 'blue' },
    { label: 'Open & reopened', value: data.open + data.reopened, icon: CircleDot, tone: 'amber' },
    { label: 'Awaiting retest', value: data.fixed, icon: RotateCcw, tone: 'violet' },
    { label: 'Verified', value: data.verified, icon: BadgeCheck, tone: 'green' },
  ] : [
    { label: 'Assigned projects', value: data.assigned_projects, icon: FolderKanban, tone: 'blue' },
    { label: 'Bugs assigned', value: data.total, icon: Bug, tone: 'blue' },
    { label: 'To do', value: data.open + data.reopened, icon: CircleDot, tone: 'amber' },
    { label: 'In progress', value: data.in_progress, icon: Activity, tone: 'violet' },
    { label: 'Done', value: data.fixed + data.verified, icon: BadgeCheck, tone: 'green' },
  ]

  return <div className="dashboard-page dashboard-personal-page">
    <div className="page-heading dashboard-personal-heading"><div><span className="eyebrow">{isTester ? 'TESTER WORKSPACE' : 'DEVELOPER WORKSPACE'}</span><h1>My dashboard</h1><p>{isTester ? 'Your reported bugs and retest work across assigned projects.' : 'Your assigned bugs and current workload.'}</p></div><div className="dashboard-personal-actions">{isTester && <Link className="button button-primary" to="/bugs/new"><Plus size={15} /> Report a bug</Link>}<Link className="button button-secondary" to={isTester ? '/bugs?status=Fixed' : '/bugs'}>{isTester ? 'Retest queue' : 'View my issues'}</Link></div></div>
    <section className="focus-banner"><div><span className="eyebrow">YOUR NEXT STEP</span><h2>{nextCount ? (isTester ? `${nextCount} issue${nextCount === 1 ? '' : 's'} ready for a fresh look.` : `${nextCount} issue${nextCount === 1 ? '' : 's'} ready to pick up.`) : 'A clear view of what comes next.'}</h2><p>{isTester ? 'Review fixes, verify the details, and help your team close the loop.' : 'Pick up your next issue and keep your team moving toward a better release.'}</p><Link className="button button-primary" to={isTester ? '/bugs?status=Fixed' : '/bugs'}>{isTester ? 'Review retest queue' : 'Explore my issues'}<ArrowUpRight size={15} /></Link></div><div className="focus-ring" style={{ '--progress': `${completion}%` } as CSSProperties} aria-label={`${completion}% ${isTester ? 'verified' : 'fixed or verified'}`}><div><b>{completion}%</b><small>{isTester ? 'verified' : 'resolved'}</small></div></div></section>
    <div className="metric-grid">{cards.map(({ label, value, icon: Icon, tone }) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="panel dashboard-personal-recent"><div className="panel-heading"><div><h2>Recent {isTester ? 'reports' : 'assignments'}</h2><p>The latest bugs in your own workload</p></div><Link className="button button-secondary" to="/bugs">View all</Link></div>{data.recent.length ? <div className="table-scroll"><table className="bug-table"><thead><tr><th>ISSUE</th><th>PROJECT</th><th>SEVERITY</th><th>STATUS</th><th>UPDATED</th><th></th></tr></thead><tbody>{data.recent.map((bug) => <tr key={bug.id}><td><Link className="bug-title-link" to={`/bugs/${bug.id}`}><b>#{bug.bug_no} · {bug.title}</b></Link></td><td>{bug.project_name}</td><td><span className={`severity severity-${bug.severity.toLowerCase()}`}><i />{bug.severity}</span></td><td><span className={`status-pill status-${bug.status.toLowerCase().replace(' ', '-')}`}>{bug.status}</span></td><td className="date-cell">{new Date(bug.updated_at).toLocaleDateString()}</td><td><Link className="table-arrow" to={`/bugs/${bug.id}`} aria-label={`Open bug ${bug.bug_no}`}><ArrowUpRight size={16} /></Link></td></tr>)}</tbody></table></div> : <div className="empty-state"><Bug size={24} /><b>{isTester ? 'No bugs reported yet' : 'No bugs assigned yet'}</b><span>{isTester ? 'Report a bug in one of your assigned projects to see it here.' : 'Assigned bugs will appear here when a tester reports them.'}</span>{isTester && <Link className="button button-secondary" to="/bugs/new"><Plus size={15} /> Report first bug</Link>}</div>}</section>
  </div>
}
