import { Suspense, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { endpoints } from './api/client'
import { AdminLayout } from './components/admin-layout'
import { LoginPage } from './pages/login'
import { AdminOverview } from './pages/admin/overview'
import { UsersPage } from './pages/admin/users'
import { ProjectsPage } from './pages/admin/projects'
import { BugListPage } from './pages/bugs/list'
import { BugDetailPage } from './pages/bugs/detail'
import { ReportBugPage } from './pages/bugs/report'
import { BugWorkspaceLayout } from './components/bug-workspace-layout'
import { ManagerTeamPage } from './pages/manager/team'
import { ManagerTeamAccountsPage } from './pages/manager/team-accounts'
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
  return <Navigate to={user.data.role === 'Admin' ? '/admin' : user.data.role === 'Manager' ? '/dashboard' : user.data.role === 'Tester' || user.data.role === 'Developer' ? '/bugs' : '/login'} replace />
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RoleGuard roles={['Manager']} />}>
      <Route path="/dashboard" element={<BugWorkspaceLayout />}><Route index element={<Suspense fallback={<div className="page-center"><div className="spinner" /></div>}><DashboardPage /></Suspense>} /></Route>
      <Route path="/project-management" element={<BugWorkspaceLayout />}><Route index element={<ProjectsPage managerMode />} /></Route>
      <Route path="/team-management" element={<BugWorkspaceLayout />}><Route index element={<ManagerTeamPage />} /></Route>
      <Route path="/team-accounts" element={<BugWorkspaceLayout />}><Route index element={<ManagerTeamAccountsPage />} /></Route>
    </Route>
    <Route element={<RoleGuard roles={['Admin']} />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="progress" element={<Suspense fallback={<div className="page-center"><div className="spinner" /></div>}><DashboardPage /></Suspense>} />
        <Route path="users" element={<UsersPage />} />
        <Route path="projects" element={<ProjectsPage />} />
      </Route>
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
  </Routes>
}
