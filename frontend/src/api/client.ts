export type Role = 'Admin' | 'Manager' | 'Tester' | 'Developer'
export type User = { id: number; user_id: string; full_name: string; role: Role; is_active: boolean }
export type Project = { id: number; name: string; description: string | null; created_by: number }
export type Module = { id: number; project_id: number; name: string }
export type BugStatus = 'Open' | 'In Progress' | 'Fixed' | 'Verified' | 'Reopened'
export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low'
export type BugType = 'Frontend' | 'Backend'
export type Attachment = { id: number; kind: 'screenshot' | 'video' | 'voice' | 'file'; file_name: string; mime_type: string; size_bytes: number; duration_seconds: number | null; created_at: string }
export type BugComment = { id: number; bug_id: number; user_id: number; body: string; created_at: string; user_name: string }
export type BugHistory = { id: number; user_id: number; from_status: BugStatus; to_status: BugStatus; note: string | null; created_at: string; user_name: string }
export type Bug = { id: number; bug_no: number; project_id: number; module_id: number; title: string; steps: string; expected_result: string; actual_result: string; severity: BugSeverity; priority: string; type: BugType; status: BugStatus; reported_by: number; assigned_to: number; fixed_by: number | null; verified_by: number | null; environment: string | null; build_version: string | null; created_at: string; updated_at: string; reporter_name: string; assignee_name: string; project_name: string; module_name: string; comments: BugComment[]; history: BugHistory[]; attachments: Attachment[] }
export type BugPage = { items: Bug[]; total: number; page: number; page_size: number }
export type DashboardSummary = { total: number; open: number; in_progress: number; fixed: number; verified: number; fix_rate_percent: number; fix_target_percent: number; by_status: { status: BugStatus; count: number }[] }
export type DashboardProject = { project_id: number; project_name: string; total: number; verified: number; fixed: number }
export type DashboardModule = { module_id: number; module_name: string; project_name: string; total: number; verified: number }
export type DashboardTester = { user_id: number; full_name: string; raised: number; to_retest: number; verified: number; reopened: number }
export type DashboardDeveloper = { user_id: number; full_name: string; assigned: number; to_do: number; in_progress: number; done: number }
export type PersonalDashboard = { role: 'Tester' | 'Developer'; assigned_projects: number; total: number; open: number; reopened: number; in_progress: number; fixed: number; verified: number; recent: { id: number; bug_no: number; project_id: number; project_name: string; title: string; status: BugStatus; severity: BugSeverity; updated_at: string }[] }

// Empty VITE_API_URL uses the current origin; the production web server proxies
// API paths to the backend, which also works when accessed from another device.
const apiBase = import.meta.env.VITE_API_URL ?? ''

function csrfToken() {
  return document.cookie.split('; ').find((part) => part.startsWith('csrf_token='))?.split('=').slice(1).join('=')
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const send = () => {
    const headers = new Headers(init.headers)
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = csrfToken()
      if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
    }
    return fetch(`${apiBase}${path}`, { ...init, method, headers, credentials: 'include' })
  }
  let response = await send()
  if (response.status === 401 && !['/auth/login', '/auth/refresh', '/auth/logout'].includes(path)) {
    const csrf = csrfToken()
    const headers = new Headers(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : undefined)
    const refreshed = await fetch(`${apiBase}/auth/refresh`, { method: 'POST', headers, credentials: 'include' })
    if (refreshed.ok) response = await send()
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const endpoints = {
  me: () => api<User>('/auth/me'),
  login: (user_id: string, password: string) => api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ user_id, password }) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  users: () => api<User[]>('/users'),
  createUser: (data: { user_id: string; full_name: string; role: Role; password: string }) => api<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: Partial<Pick<User, 'user_id' | 'full_name' | 'role' | 'is_active'>>) => api<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resetPassword: (id: number, new_password: string) => api<void>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password }) }),
  projects: () => api<Project[]>('/projects'),
  createProject: (data: { name: string; description: string }) => api<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: number, data: { name: string; description: string }) => api<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: number) => api<void>(`/projects/${id}`, { method: 'DELETE' }),
  modules: (projectId: number) => api<Module[]>(`/projects/${projectId}/modules`),
  createModule: (projectId: number, name: string) => api<Module>(`/projects/${projectId}/modules`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteModule: (projectId: number, moduleId: number) => api<void>(`/projects/${projectId}/modules/${moduleId}`, { method: 'DELETE' }),
  members: (projectId: number, user_ids: number[]) => api<User[]>(`/projects/${projectId}/members`, { method: 'PUT', body: JSON.stringify({ user_ids }) }),
  projectMembers: (projectId: number) => api<User[]>(`/projects/${projectId}/members`),
  myProjects: () => api<Project[]>('/my/projects'),
  myModules: (projectId: number) => api<Module[]>(`/my/projects/${projectId}/modules`),
  projectDevelopers: (projectId: number) => api<User[]>(`/my/projects/${projectId}/developers`),
  bugs: (params: URLSearchParams) => api<BugPage>(`/bugs?${params.toString()}`),
  bug: (id: number) => api<Bug>(`/bugs/${id}`),
  createBug: (data: Record<string, unknown>) => api<Bug>('/bugs', { method: 'POST', body: JSON.stringify(data) }),
  updateBug: (id: number, data: Partial<Pick<Bug, 'module_id' | 'title' | 'steps' | 'expected_result' | 'actual_result' | 'severity' | 'priority' | 'type' | 'assigned_to' | 'environment' | 'build_version'>>) => api<Bug>(`/bugs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  transitionBug: (id: number, to_status: BugStatus, comment?: string) => api<Bug>(`/bugs/${id}/transition`, { method: 'POST', body: JSON.stringify({ to_status, comment }) }),
  addComment: (id: number, body: string) => api<BugComment>(`/bugs/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  uploadAttachment: (id: number, file: File, duration_seconds?: number) => { const form = new FormData(); form.append('file', file); if (duration_seconds !== undefined) form.append('duration_seconds', String(duration_seconds)); return api<Attachment>(`/bugs/${id}/attachments`, { method: 'POST', body: form }) },
  attachmentUrl: (id: number) => `${apiBase}/attachments/${id}/download`,
  dashboardSummary: () => api<DashboardSummary>('/dashboard/summary'),
  personalDashboard: () => api<PersonalDashboard>('/dashboard/me'),
  dashboardProjects: () => api<DashboardProject[]>('/dashboard/by-project'),
  dashboardModules: () => api<DashboardModule[]>('/dashboard/by-module'),
  dashboardTesters: () => api<DashboardTester[]>('/dashboard/testers'),
  dashboardDevelopers: () => api<DashboardDeveloper[]>('/dashboard/developers'),
  managerUsers: () => api<User[]>('/manager/users'),
  managerCreateUser: (data: { user_id: string; full_name: string; role: 'Tester' | 'Developer'; password: string }) => api<User>('/manager/users', { method: 'POST', body: JSON.stringify(data) }),
  managerProjects: () => api<Project[]>('/manager/projects'),
  managerCreateProject: (data: { name: string; description: string }) => api<Project>('/manager/projects', { method: 'POST', body: JSON.stringify(data) }),
  managerUpdateProject: (id: number, data: { name: string; description: string }) => api<Project>(`/manager/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  managerModules: (projectId: number) => api<Module[]>(`/manager/projects/${projectId}/modules`),
  managerCreateModule: (projectId: number, name: string) => api<Module>(`/manager/projects/${projectId}/modules`, { method: 'POST', body: JSON.stringify({ name }) }),
  managerDeleteModule: (projectId: number, moduleId: number) => api<void>(`/manager/projects/${projectId}/modules/${moduleId}`, { method: 'DELETE' }),
  managerMembers: (projectId: number) => api<User[]>(`/manager/projects/${projectId}/members`),
  managerSetMembers: (projectId: number, user_ids: number[]) => api<User[]>(`/manager/projects/${projectId}/members`, { method: 'PUT', body: JSON.stringify({ user_ids }) }),
}
