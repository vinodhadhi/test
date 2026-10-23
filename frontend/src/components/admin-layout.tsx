import { Activity, Boxes, Bug, LayoutDashboard, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { WorkspaceShell } from './workspace-shell'

export function AdminLayout() {
  return <WorkspaceShell>
    <NavLink to="/admin" end><LayoutDashboard size={18} /> Overview</NavLink>
    <NavLink to="/admin/progress"><Activity size={18} /> Progress dashboard</NavLink>
    <NavLink to="/admin/users"><UsersRound size={18} /> People</NavLink>
    <NavLink to="/admin/projects"><Boxes size={18} /> Projects & modules</NavLink>
    <NavLink to="/bugs"><Bug size={18} /> Issue tracker</NavLink>
  </WorkspaceShell>
}
