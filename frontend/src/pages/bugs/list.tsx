import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowUpRight, Bug as BugIcon, CircleCheck, Clock3, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { endpoints, type Bug, type BugSeverity } from '../../api/client'
import { Button, Card, PageHeader, Select } from '../../components/ui'

const severityRank: Record<BugSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const statuses = ['Open', 'In Progress', 'Fixed', 'Verified', 'Reopened']
const PAGE_SIZE = 25

export function BugListPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const projects = useQuery({ queryKey: ['my-projects'], queryFn: endpoints.myProjects })
  const managerProjects = useQuery({ queryKey: ['manager-projects'], queryFn: endpoints.managerProjects, enabled: me.data?.role === 'Manager' })
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const [draftSearch, setDraftSearch] = useState(search)
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
  const project = searchParams.get('project') ?? ''
  const status = searchParams.get('status') ?? ''
  const severity = searchParams.get('severity') ?? ''
  const testerScope = searchParams.get('scope') === 'project' ? 'project' : 'mine'
  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
  if (testerScope === 'project') params.set('scope', 'project')
  if (project) params.set('project', project)
  if (status) params.set('status', status)
  if (severity) params.set('severity', severity)
  if (search.trim()) params.set('search', search.trim())
  const bugs = useQuery({ queryKey: ['bugs', params.toString()], queryFn: () => endpoints.bugs(params) })
  const role = me.data?.role
  const projectOptions = role === 'Manager' ? managerProjects.data ?? [] : projects.data ?? []
  const canReport = role === 'Tester' || role === 'Admin'
  const items = useMemo(() => [...(bugs.data?.items ?? [])].sort((a, b) => role === 'Developer' ? severityRank[a.severity] - severityRank[b.severity] || Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at)), [bugs.data?.items, role])
  const projectGroups = useMemo(() => {
    const grouped = new Map<number, { name: string; issues: Bug[] }>()
    for (const bug of items) {
      if (!grouped.has(bug.project_id)) grouped.set(bug.project_id, { name: bug.project_name, issues: [] })
      grouped.get(bug.project_id)!.issues.push(bug)
    }
    return [...grouped.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, group]) => ({
      id, name: group.name,
      issues: role === 'Tester' ? group.issues.sort((a, b) => Number(b.status === 'Fixed') - Number(a.status === 'Fixed') || severityRank[a.severity] - severityRank[b.severity] || Date.parse(b.created_at) - Date.parse(a.created_at)) : group.issues,
    }))
  }, [items, role])
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setSearchParams(next)
  }
  useEffect(() => { setDraftSearch(search) }, [search])
  useEffect(() => {
    if (draftSearch.trim() === search) return
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (draftSearch.trim()) next.set('search', draftSearch.trim())
      else next.delete('search')
      next.delete('page')
      setSearchParams(next, { replace: true })
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [draftSearch, search, searchParams, setSearchParams])
  const goToPage = (target: number) => {
    const next = new URLSearchParams(searchParams)
    if (target > 1) next.set('page', String(target))
    else next.delete('page')
    setSearchParams(next)
  }
  const pageCount = Math.max(1, Math.ceil((bugs.data?.total ?? 0) / PAGE_SIZE))
  useEffect(() => {
    if (bugs.data && page > pageCount) goToPage(pageCount)
  }, [bugs.data, page, pageCount])
  const counts = [
    { label: 'Total issues', value: bugs.data?.total ?? 0, icon: BugIcon, helper: role === 'Tester' && testerScope === 'mine' ? 'Reported by you' : 'In your workspace' },
    { label: 'Open on page', value: items.filter((b) => b.status === 'Open' || b.status === 'Reopened').length, icon: AlertCircle, helper: 'On this page' },
    { label: 'In progress on page', value: items.filter((b) => b.status === 'In Progress').length, icon: Clock3, helper: 'On this page' },
    { label: 'Verified on page', value: items.filter((b) => b.status === 'Verified').length, icon: CircleCheck, helper: 'On this page' },
  ]

  return <>
    <PageHeader eyebrow={role === 'Developer' ? 'DEVELOPER WORKSPACE' : role === 'Tester' ? 'TESTER WORKSPACE' : role === 'Manager' ? 'MANAGER WORKSPACE' : 'BUG TRACKING'} title={role === 'Developer' ? 'My queue' : role === 'Manager' || role === 'Admin' ? 'All issues' : role === 'Tester' && testerScope === 'project' ? 'Project issues' : 'My bugs'} description={role === 'Developer' ? 'Issues assigned to you, ordered by severity.' : role === 'Manager' ? 'Read-only view of reported issues across your workspace.' : role === 'Admin' ? 'Track reported issues across every project.' : role === 'Tester' && testerScope === 'project' ? 'Issues reported by everyone in your assigned projects.' : 'Track the issues you reported and follow them through retest.'} action={canReport && <Link className="button button-primary" to="/bugs/new"><Plus size={16} /> Report a bug</Link>} />
    <div className="metric-grid bug-metrics">{counts.map(({ label, value, icon: Icon, helper }) => <Card className="metric-card" key={label}><div className="metric-top"><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><small>{helper}</small></Card>)}</div>
    <Card className="table-card bug-list-card">
      <div className="bug-toolbar">
        <div className="bug-toolbar-title"><div><h3>Issues</h3><p>{bugs.data?.total ?? 0} total · page {page} of {pageCount}</p></div>{role === 'Tester' && <div className="queue-tabs"><Link className={testerScope === 'mine' && !status ? 'selected' : ''} to="/bugs">My reports</Link><Link className={testerScope === 'mine' && status === 'Fixed' ? 'selected' : ''} to="/bugs?status=Fixed">Retest queue</Link><Link className={testerScope === 'project' ? 'selected' : ''} to="/bugs?scope=project">Project issues</Link></div>}</div>
        <div className="bug-filters"><label className="search-box"><Search size={15} /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} aria-label="Search issues" placeholder="Search issue title…" /></label><Select value={project} onChange={(event) => setFilter('project', event.target.value)} aria-label="Filter by project"><option value="">All projects</option>{projectOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Select value={status} onChange={(event) => setFilter('status', event.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</Select><Select value={severity} onChange={(event) => setFilter('severity', event.target.value)} aria-label="Filter by severity"><option value="">All severity</option>{['Critical', 'High', 'Medium', 'Low'].map((item) => <option key={item}>{item}</option>)}</Select></div>
      </div>
      {(search || project || status || severity) && <div className="filter-reset"><Button variant="ghost" onClick={() => { setDraftSearch(''); setSearchParams(new URLSearchParams()) }}>Clear filters</Button></div>}
      {bugs.isPending ? <div className="loading-row">Loading issues…</div> : bugs.isError ? <div className="empty-state"><BugIcon /><b>Could not load issues</b><span>{bugs.error.message}</span><Button variant="secondary" onClick={() => bugs.refetch()}>Try again</Button></div> : items.length === 0 ? <div className="empty-state"><BugIcon /><b>{search || project || status || severity ? 'No issues match these filters' : 'No issues yet'}</b><span>{search || project || status || severity ? 'Try a different search or clear the filters.' : canReport ? 'Report an issue to start the QA workflow.' : 'Issues assigned to you will appear here.'}</span>{canReport && !(search || project || status || severity) && <Link className="button button-secondary" to="/bugs/new"><Plus size={15} /> Report first bug</Link>}</div> : (role === 'Developer' || role === 'Tester') ? <div className="developer-project-queues">{projectGroups.map((group) => <ProjectIssueSection key={group.id} name={group.name} issues={group.issues} role={role} />)}</div> : <div className="table-scroll"><table className="bug-table"><thead><tr><th>ISSUE</th><th>PROJECT / MODULE</th><th>SEVERITY</th><th>STATUS</th><th>ASSIGNEE</th><th>REPORTED</th><th></th></tr></thead><tbody>{items.map((bug) => <tr key={bug.id}><td><Link to={`/bugs/${bug.id}`} className="bug-title-link"><b>#{bug.bug_no} · {bug.title}</b><small>{bug.type} · {bug.attachments.length} attachment{bug.attachments.length === 1 ? '' : 's'}</small></Link></td><td><span className="project-module-cell">{bug.project_name}<small>{bug.module_name}</small></span></td><td><span className={`severity severity-${bug.severity.toLowerCase()}`}><i />{bug.severity}</span></td><td><span className={`status-pill status-${bug.status.toLowerCase().replace(' ', '-')}`}>{bug.status}</span></td><td>{bug.assignee_name}</td><td className="date-cell">{new Date(bug.created_at).toLocaleDateString()}</td><td><Link className="table-arrow" to={`/bugs/${bug.id}`} aria-label={`Open bug ${bug.bug_no}`}><ArrowUpRight size={16} /></Link></td></tr>)}</tbody></table></div>}
      {!!bugs.data?.total && <div className="table-foot bug-pagination"><span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, bugs.data.total)} of {bugs.data.total}</span><div><Button variant="secondary" onClick={() => goToPage(page - 1)} disabled={page <= 1 || bugs.isFetching}>Previous</Button><Button variant="secondary" onClick={() => goToPage(page + 1)} disabled={page >= pageCount || bugs.isFetching}>Next</Button></div></div>}
    </Card>
  </>
}

function ProjectIssueSection({ name, issues, role }: { name: string; issues: Bug[]; role: 'Developer' | 'Tester' }) {
  const active = issues.filter((bug) => !['Fixed', 'Verified'].includes(bug.status)).length
  const toRetest = issues.filter((bug) => bug.status === 'Fixed').length
  return <section className="developer-project-section" aria-label={`${name} issues`}>
    <div className="developer-project-heading"><div><span className="project-symbol"><BugIcon size={17} /></span><div><h4>{name}</h4><p>{issues.length} issue{issues.length === 1 ? '' : 's'} on this page · {active} active{role === 'Tester' ? ` · ${toRetest} to retest` : ''}</p></div></div><span className="developer-project-count">{issues.length}</span></div>
    <div className="developer-project-items">{issues.map((bug) => <Link className="developer-project-issue" to={`/bugs/${bug.id}`} key={bug.id}>
      <div className="developer-issue-main"><b>#{bug.bug_no} · {bug.title}</b><small>{bug.module_name} · {bug.type} · Reported {new Date(bug.created_at).toLocaleDateString()}</small></div>
      <span className={`severity severity-${bug.severity.toLowerCase()}`}><i />{bug.severity}</span>
      <span className={`status-pill status-${bug.status.toLowerCase().replace(' ', '-')}`}>{bug.status}</span>
      <ArrowUpRight size={16} className="developer-issue-arrow" />
    </Link>)}</div>
  </section>
}
