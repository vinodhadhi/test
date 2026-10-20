import { useQuery } from '@tanstack/react-query'
import { Activity, BadgeCheck, Bug, CircleDot, Code2, UsersRound } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { endpoints } from '../api/client'

function Loading() { return <div className="page-center"><div className="spinner" aria-label="Loading dashboard" /></div> }
function ErrorState({ message }: { message: string }) { return <div className="notice notice-error" role="alert">{message}</div> }

export function DashboardPage() {
  const summary = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: endpoints.dashboardSummary })
  const projects = useQuery({ queryKey: ['dashboard', 'projects'], queryFn: endpoints.dashboardProjects })
  const modules = useQuery({ queryKey: ['dashboard', 'modules'], queryFn: endpoints.dashboardModules })
  const testers = useQuery({ queryKey: ['dashboard', 'testers'], queryFn: endpoints.dashboardTesters })
  const developers = useQuery({ queryKey: ['dashboard', 'developers'], queryFn: endpoints.dashboardDevelopers })
  if ([summary, projects, modules, testers, developers].some((query) => query.isPending)) return <Loading />
  const failed = [summary, projects, modules, testers, developers].find((query) => query.isError)
  if (failed) return <ErrorState message={failed.error instanceof Error ? failed.error.message : 'Could not load dashboard data.'} />
  const data = summary.data!
  const cards = [
    { label: 'Total bugs', value: data.total, icon: Bug, tone: 'blue' },
    { label: 'Open & reopened', value: data.open, icon: CircleDot, tone: 'amber' },
    { label: 'In progress', value: data.in_progress, icon: Activity, tone: 'violet' },
    { label: 'Fixed', value: data.fixed, icon: BadgeCheck, tone: 'blue' },
    { label: 'Verified', value: data.verified, icon: BadgeCheck, tone: 'green' },
    { label: `Fix rate · ${data.fix_target_percent}% target`, value: `${data.fix_rate_percent}%`, icon: Activity, tone: data.fix_rate_percent >= data.fix_target_percent ? 'green' : 'amber' },
  ]
  return <div className="dashboard-page">
    <div className="page-heading"><div><span className="eyebrow">QUALITY OVERVIEW</span><h1>Progress dashboard</h1><p>Bug resolution and team workload across projects.</p></div></div>
    <div className="metric-grid">{cards.map(({ label, value, icon: Icon, tone }) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="dashboard-grid">
      <section className="panel dashboard-chart"><div className="panel-heading"><div><h2>Project progress</h2><p>Verified and fixed bugs by project</p></div></div>{projects.data!.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={projects.data!} margin={{ top: 10, right: 12, left: -18, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="project_name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="verified" name="Verified" fill="#1f9d70" radius={[5, 5, 0, 0]} /><Bar dataKey="fixed" name="Fixed" fill="#5995e9" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="empty-state">No projects to report yet.</p>}</section>
      <section className="panel dashboard-chart"><div className="panel-heading"><div><h2>Module coverage</h2><p>Verified bugs against reported bugs</p></div></div><div className="module-progress-list">{modules.data!.length ? modules.data!.map((module) => <div className="module-progress" key={module.module_id}><div className="module-progress-copy"><span>{module.project_name} · {module.module_name}</span><small>{module.verified}/{module.total} verified</small></div><div className="progress-track"><span style={{ width: `${module.total ? Math.round(module.verified / module.total * 100) : 0}%` }} /></div></div>) : <p className="empty-state">No modules to report yet.</p>}</div></section>
      <section className="panel team-panel"><div className="panel-heading"><div><h2><UsersRound size={17} /> Tester activity</h2><p>Raised bugs, retest queue, verified and reopened</p></div></div><PeopleTable rows={testers.data!.map((person) => ({ user_id: person.user_id, full_name: person.full_name, metrics: [{ label: 'Raised', value: person.raised }, { label: 'To retest', value: person.to_retest }, { label: 'Verified', value: person.verified }, { label: 'Reopened', value: person.reopened }] }))} empty="No testers yet." /></section>
      <section className="panel team-panel"><div className="panel-heading"><div><h2><Code2 size={17} /> Developer workload</h2><p>Assigned, to do, in progress and done</p></div></div><PeopleTable rows={developers.data!.map((person) => ({ user_id: person.user_id, full_name: person.full_name, metrics: [{ label: 'Assigned', value: person.assigned }, { label: 'To do', value: person.to_do }, { label: 'In progress', value: person.in_progress }, { label: 'Done', value: person.done }] }))} empty="No developers yet." /></section>
    </div>
  </div>
}

export default DashboardPage

function PeopleTable({ rows, empty }: { rows: { user_id: number; full_name: string; metrics: { label: string; value: number }[] }[]; empty: string }) {
  return rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Team member</th>{rows[0].metrics.map((metric) => <th key={metric.label}>{metric.label}</th>)}</tr></thead><tbody>{rows.map((person) => <tr key={person.user_id}><td>{person.full_name}</td>{person.metrics.map((metric) => <td key={metric.label}>{metric.value}</td>)}</tr>)}</tbody></table></div> : <p className="empty-state">{empty}</p>
}
