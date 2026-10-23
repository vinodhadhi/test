import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bug, ChevronRight, LogOut, Menu, Moon, Search, ShieldCheck, Sun, X } from 'lucide-react'
import { Suspense, useState, type PropsWithChildren } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { endpoints } from '../api/client'
import { Notifications } from './notifications'
import { useTheme } from './use-theme'
import { Button, PageErrorBoundary, RouteLoading } from './ui'

const pageNames: Record<string, string> = {
  '/admin': 'Overview', '/admin/progress': 'Progress dashboard', '/admin/users': 'People',
  '/admin/projects': 'Projects & modules', '/dashboard': 'Team dashboard',
  '/my-dashboard': 'My dashboard', '/bugs': 'Issue tracker', '/bugs/new': 'Report a bug',
  '/project-management': 'Projects & modules', '/team-management': 'Team assignments',
  '/team-accounts': 'Team accounts',
}

export function WorkspaceShell({ children }: PropsWithChildren) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const logout = useMutation({ mutationFn: endpoints.logout, onSettled: () => { client.clear(); navigate('/login', { replace: true }) } })
  const { dark, toggleDark } = useTheme()
  const [navOpen, setNavOpen] = useState(false)
  const [search, setSearch] = useState('')
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link to="/" className="brand"><span className="brand-mark"><Bug size={21} /></span><span>QA Desk<small>QUALITY, TOGETHER</small></span></Link>
        <button className="mobile-menu-toggle" type="button" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-controls="workspace-navigation" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>{navOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
      <div className="workspace-identity"><span className="workspace-monogram">QA</span><div><b>Product workspace</b><small>{me.data?.role} access</small></div><ShieldCheck size={16} /></div>
      <p className="nav-label">WORKSPACE</p>
      <nav id="workspace-navigation" aria-label="Workspace navigation" className={`main-nav${navOpen ? ' nav-open' : ''}`} onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setNavOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') setNavOpen(false) }}>{children}</nav>
      <div className="sidebar-footer"><ShieldCheck size={20} /><div><b>Built for better releases</b><small>Every issue. One shared view.</small></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumb">Workspace <ChevronRight size={14} /><b>{pageNames[pathname] ?? 'Issue details'}</b></div>
        <div className="top-actions">
          <form className="workspace-search" role="search" onSubmit={(event) => { event.preventDefault(); navigate(`/bugs${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`); setSearch('') }}><Search size={16} /><input aria-label="Search all accessible issues" placeholder="Find an issue…" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} /><button type="submit" aria-label="Search issues"><ChevronRight size={15} /></button></form>
          <Notifications />
          <Button variant="ghost" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark} onClick={toggleDark} className="icon-button">{dark ? <Sun size={17} /> : <Moon size={17} />}</Button>
          <div className="profile"><div className="avatar">{me.data?.full_name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div><div className="profile-copy"><b>{me.data?.full_name}</b><small>{me.data?.role}</small></div></div>
          <Button variant="ghost" disabled={logout.isPending} onClick={() => logout.mutate()} title="Sign out" aria-label="Sign out" className="icon-button"><LogOut size={17} /></Button>
        </div>
      </header>
      <div className="content" id="main-content" tabIndex={-1}><div className="page-transition" key={pathname}><PageErrorBoundary><Suspense fallback={<RouteLoading />}><Outlet /></Suspense></PageErrorBoundary></div></div>
    </main>
  </div>
}
