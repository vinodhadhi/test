import { useQuery } from '@tanstack/react-query'
import { ClipboardList, FolderKanban, LayoutDashboard, Plus, UserPlus, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { endpoints } from '../api/client'
import { DeveloperProjectMenu } from './developer-project-menu'
import { WorkspaceShell } from './workspace-shell'

export function BugWorkspaceLayout() {
  const me = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const role = me.data?.role
  return <WorkspaceShell>{role === 'Manager' ? <>
    <NavLink to="/dashboard"><LayoutDashboard size={18} /> Dashboard</NavLink>
    <NavLink to="/bugs"><ClipboardList size={18} /> All issues</NavLink>
    <NavLink to="/project-management"><FolderKanban size={18} /> Projects & modules</NavLink>
    <NavLink to="/team-management"><UsersRound size={18} /> Team assignments</NavLink>
    <NavLink to="/team-accounts"><UserPlus size={18} /> Team accounts</NavLink>
  </> : <>
    {(role === 'Tester' || role === 'Developer') && <NavLink to="/my-dashboard"><LayoutDashboard size={18} /> Dashboard</NavLink>}
    {role === 'Developer' ? <DeveloperProjectMenu /> : <NavLink to="/bugs" end><ClipboardList size={18} /> {role === 'Admin' ? 'All issues' : 'My bugs'}</NavLink>}
    {(role === 'Tester' || role === 'Admin') && <NavLink to="/bugs/new"><Plus size={18} /> Report a bug</NavLink>}
    {role === 'Admin' && <NavLink to="/admin"><LayoutDashboard size={18} /> Administration</NavLink>}
  </>}</WorkspaceShell>
}
