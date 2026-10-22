import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Boxes, Bug, LayoutDashboard, LogOut, Menu, Moon, Sun, UsersRound, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { endpoints } from '../api/client'
import { Button } from './ui'
import { Notifications } from './notifications'
import { useTheme } from './use-theme'

export function AdminLayout() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const logout = useMutation({ mutationFn: endpoints.logout, onSettled: () => { client.clear(); navigate('/login', { replace: true }) } })
  const { dark, toggleDark } = useTheme()
  const [navOpen, setNavOpen] = useState(false)
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <div className="sidebar-top"><div className="brand"><span className="brand-mark"><Bug size={19} /></span><span>QA Desk<small>BUG TRACKING</small></span></div><button className="mobile-menu-toggle" type="button" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-controls="admin-navigation" aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}>{navOpen ? <X size={20} /> : <Menu size={20} />}</button></div>
      <p className="nav-label">WORKSPACE</p>
      <nav id="admin-navigation" aria-label="Administration navigation" className={`main-nav${navOpen ? ' nav-open' : ''}`} onClick={() => setNavOpen(false)}>
        <NavLink to="/admin" end><LayoutDashboard size={17} /> Overview</NavLink>
        <NavLink to="/admin/progress"><Activity size={17} /> Progress dashboard</NavLink>
        <NavLink to="/admin/users"><UsersRound size={17} /> Users</NavLink>
        <NavLink to="/admin/projects"><Boxes size={17} /> Projects & modules</NavLink>
        <NavLink to="/bugs"><Bug size={17} /> Bug tracker</NavLink>
      </nav>
      <div className="sidebar-footer"><span className="status-dot" /> All systems operational</div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Administration</div><div className="top-actions"><Notifications /><Button variant="ghost" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark} onClick={toggleDark} className="icon-button"><Sun className="sun-icon" size={17} /><Moon className="moon-icon" size={17} /></Button><div className="profile"><div className="avatar">{me.data?.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div><div className="profile-copy"><b>{me.data?.full_name ?? 'Administrator'}</b><small>Administrator</small></div></div><Button variant="ghost" onClick={() => logout.mutate()} title="Sign out" aria-label="Sign out" className="icon-button"><LogOut size={17} /></Button></div></header>
      <div className="content" id="main-content"><div className="page-transition" key={location.pathname}><Outlet /></div></div>
    </main>
  </div>
}
