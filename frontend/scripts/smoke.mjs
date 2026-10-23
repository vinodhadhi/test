import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
import { writeFile, unlink } from 'node:fs/promises'
import { StaticRouter } from 'react-router-dom'

// Render real pages with isolated cache data; never contact the configured API.
const bundle = await build({
  stdin: { contents: "export { LoginPage } from './src/pages/login'; export { PersonalDashboardPage } from './src/pages/personal-dashboard'; export { BugListPage } from './src/pages/bugs/list'; export { AdminOverview } from './src/pages/admin/overview'", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
  define: { 'import.meta.env.VITE_API_URL': 'undefined' },
})
const temporaryModule = new URL('../node_modules/.qa-smoke.mjs', import.meta.url)
await writeFile(temporaryModule, bundle.outputFiles[0].text)
const render = (Page, data, location = '/') => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  for (const [key, value] of data) client.setQueryData(key, value)
  try {
    return renderToString(createElement(QueryClientProvider, { client }, createElement(StaticRouter, { location }, createElement(Page))))
  } finally { client.clear() }
}

try {
  const { LoginPage, PersonalDashboardPage, BugListPage, AdminOverview } = await import(temporaryModule.href)
  const login = render(LoginPage, [], '/login')
  assert.match(login, /Welcome back/)
  assert.match(login, /type="password"/)
  assert.match(login, /Show password/)
  assert.match(login, /autoComplete="username"/)
  assert.match(login, /quality-flow.svg/)
  assert.doesNotMatch(login, /lucide-bug/)

  const dashboard = { role: 'Tester', assigned_projects: 2, total: 10, open: 2, reopened: 1, in_progress: 1, fixed: 2, verified: 4, recent: [] }
  const tester = render(PersonalDashboardPage, [[['dashboard', 'me'], dashboard]])
  assert.match(tester, /2 issues ready for a fresh look/)
  assert.match(tester, /40% verified/)
  assert.match(tester, /href="\/bugs\?status=Fixed"/)
  assert.match(tester, /Where the work stands/)
  assert.match(tester, /Open: 3, In progress: 1, Ready for retest: 2, Verified: 4/)
  assert.doesNotMatch(tester, /lucide-bug/)
  const developer = render(PersonalDashboardPage, [[['dashboard', 'me'], { ...dashboard, role: 'Developer' }]])
  assert.match(developer, /3 issues ready to pick up/)
  assert.match(developer, /60% fixed or verified/)
  assert.doesNotMatch(developer, /Report a bug/)
  const empty = render(PersonalDashboardPage, [[['dashboard', 'me'], { ...dashboard, total: 0, open: 0, reopened: 0, in_progress: 0, fixed: 0, verified: 0 }]])
  assert.match(empty, /0% verified/)
  assert.doesNotMatch(empty, /NaN|Infinity/)

  const admin = render(AdminOverview, [[['users'], [
    { id: 1, role: 'Admin', is_active: true },
    { id: 2, role: 'Tester', is_active: true },
    { id: 3, role: 'Developer', is_active: false },
  ]], [['projects'], []]])
  assert.match(admin, /Team composition/)
  assert.match(admin, /Admin: 1, Manager: 0, Tester: 1, Developer: 1/)

  const issues = render(BugListPage, [
    [['me'], { role: 'Tester' }], [['my-projects'], []],
    [['bugs', 'page=1&page_size=25&scope=project&status=Fixed'], { items: [], total: 0 }],
  ], '/bugs?scope=project&status=Fixed&page=Infinity')
  assert.match(issues, /Project issues/)
  assert.match(issues, /Remove status filter: Fixed/)
  assert.match(issues, /No issues match these filters/)
  assert.doesNotMatch(issues, /page Infinity/)
  console.log('Passed 22 UI smoke assertions: login artwork, status and team charts, role-specific dashboards, empty data, filters, and invalid pagination.')
} finally {
  await unlink(temporaryModule)
}
