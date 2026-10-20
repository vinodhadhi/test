import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Boxes, Bug, ChevronDown, LayoutDashboard, LogOut, Moon, Sun, UsersRound } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { endpoints } from '../api/client'
import { Button } from './ui'

export function AdminLayout() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const logout = useMutation({ mutationFn: endpoints.logout, onSettled: () => { client.clear(); navigate('/login', { replace: true }) } })
  const toggleDark = () => {
    document.documentElement.classList.toggle('dark')
    localStorage.setItem('qa-dark', document.documentElement.classList.contains('dark') ? 'yes' : 'no')
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Bug size={19} /></span><span>QA Desk<small>BUG TRACKING</small></span></div>
      <p className="nav-label">WORKSPACE</p>
      <nav className="main-nav">
        <NavLink to="/admin" end><LayoutDashboard size={17} /> Overview</NavLink>
        <NavLink to="/admin/progress"><Activity size={17} /> Progress dashboard</NavLink>
        <NavLink to="/admin/users"><UsersRound size={17} /> Users</NavLink>
        <NavLink to="/admin/projects"><Boxes size={17} /> Projects & modules</NavLink>
        <NavLink to="/bugs"><Bug size={17} /> Bug tracker</NavLink>
      </nav>
      <div className="sidebar-footer"><span className="status-dot" /> All systems operational</div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Administration</div><div className="top-actions"><Button variant="ghost" aria-label="Toggle dark mode" onClick={toggleDark} className="icon-button"><Sun className="sun-icon" size={17} /><Moon className="moon-icon" size={17} /></Button><div className="profile"><div className="avatar">{me.data?.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div><div className="profile-copy"><b>{me.data?.full_name ?? 'Administrator'}</b><small>Administrator</small></div><ChevronDown size={15} /></div><Button variant="ghost" onClick={() => logout.mutate()} title="Sign out" className="icon-button"><LogOut size={17} /></Button></div></header>
      <div className="content"><Outlet /></div>
    </main>
  </div>
}
