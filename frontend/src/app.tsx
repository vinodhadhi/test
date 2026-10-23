import { Suspense, lazy, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { endpoints } from './api/client'
import { AdminLayout } from './components/admin-layout'
import { RouteLoading } from './components/ui'
import { LoginPage } from './pages/login'
const AdminOverview = lazy(() => import('./pages/admin/overview').then(module => ({ default: module.AdminOverview })))
const UsersPage = lazy(() => import('./pages/admin/users').then(module => ({ default: module.UsersPage })))
const ProjectsPage = lazy(() => import('./pages/admin/projects').then(module => ({ default: module.ProjectsPage })))
const BugListPage = lazy(() => import('./pages/bugs/list').then(module => ({ default: module.BugListPage })))
const BugDetailPage = lazy(() => import('./pages/bugs/detail').then(module => ({ default: module.BugDetailPage })))
const ReportBugPage = lazy(() => import('./pages/bugs/report').then(module => ({ default: module.ReportBugPage })))
import { BugWorkspaceLayout } from './components/bug-workspace-layout'
const ManagerTeamPage = lazy(() => import('./pages/manager/team').then(module => ({ default: module.ManagerTeamPage })))
const ManagerTeamAccountsPage = lazy(() => import('./pages/manager/team-accounts').then(module => ({ default: module.ManagerTeamAccountsPage })))
const PersonalDashboardPage = lazy(() => import('./pages/personal-dashboard').then(module => ({ default: module.PersonalDashboardPage })))
const DashboardPage = lazy(() => import('./pages/dashboard').then((module) => ({ default: module.DashboardPage })))

function RoleGuard({ roles }: { roles: string[] }) {
  const location = useLocation()
  const user = useQuery({ queryKey: ['me'], queryFn: endpoints.me, retry: false })
  if (user.isPending) return <div className="page-center"><div className="spinner" aria-label="Loading account" /></div>
  if (user.isError) return <Navigate to="/login" state={{ from: location }} replace />
  if (!roles.includes(user.data.role)) return <Navigate to="/" replace />
  return <Outlet />
}

function HomeRedirect() {
  const user = useQuery({ queryKey: ['me'], queryFn: endpoints.me, retry: false })
  if (user.isPending) return <div className="page-center"><div className="spinner" /></div>
  if (user.isError) return <Navigate to="/login" replace />
  return <Navigate to={user.data.role === 'Admin' ? '/admin' : user.data.role === 'Manager' ? '/dashboard' : user.data.role === 'Tester' || user.data.role === 'Developer' ? '/my-dashboard' : '/login'} replace />
}

export default function App() {
  const client = useQueryClient()
  const navigate = useNavigate()
  useEffect(() => {
    const sessionExpired = () => { client.clear(); navigate('/login', { replace: true }) }
    window.addEventListener('qa-session-expired', sessionExpired)
    return () => window.removeEventListener('qa-session-expired', sessionExpired)
  }, [client, navigate])
  return <Suspense fallback={<RouteLoading />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RoleGuard roles={['Manager']} />}>
      <Route path="/dashboard" element={<BugWorkspaceLayout />}><Route index element={<DashboardPage />} /></Route>
      <Route path="/project-management" element={<BugWorkspaceLayout />}><Route index element={<ProjectsPage managerMode />} /></Route>
      <Route path="/team-management" element={<BugWorkspaceLayout />}><Route index element={<ManagerTeamPage />} /></Route>
      <Route path="/team-accounts" element={<BugWorkspaceLayout />}><Route index element={<ManagerTeamAccountsPage />} /></Route>
    </Route>
    <Route element={<RoleGuard roles={['Admin']} />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="progress" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="projects" element={<ProjectsPage />} />
      </Route>
    </Route>
    <Route element={<RoleGuard roles={['Tester', 'Developer']} />}>
      <Route path="/my-dashboard" element={<BugWorkspaceLayout />}><Route index element={<PersonalDashboardPage />} /></Route>
    </Route>
    <Route element={<RoleGuard roles={['Admin', 'Manager', 'Tester', 'Developer']} />}>
      <Route path="/bugs" element={<BugWorkspaceLayout />}>
        <Route index element={<BugListPage />} />
        <Route element={<RoleGuard roles={['Admin', 'Tester']} />}>
          <Route path="new" element={<ReportBugPage />} />
        </Route>
        <Route path=":id" element={<BugDetailPage />} />
      </Route>
    </Route>
    <Route path="*" element={<HomeRedirect />} />
  </Routes></Suspense>
}
