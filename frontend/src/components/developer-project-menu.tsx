import { useQuery } from '@tanstack/react-query'
import { ChevronDown, FolderKanban } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { endpoints } from '../api/client'
import './developer-project-menu.css'

export function DeveloperProjectMenu() {
  const projects = useQuery({ queryKey: ['my-projects'], queryFn: endpoints.myProjects })
  const location = useLocation()
  const selected = location.pathname === '/bugs' ? new URLSearchParams(location.search).get('project') : null
  return <details className="developer-project-menu">
    <summary onClick={(event) => event.stopPropagation()}><FolderKanban size={17} /><span>Projects</span>
      <ChevronDown size={15} />
    </summary>
    <div className="developer-project-submenu">
      {projects.isPending ? <p role="status">Loading projects…</p> : projects.isError ? <div role="alert"><p>Could not load projects.</p><button type="button" onClick={(event) => { event.stopPropagation(); projects.refetch() }}>Retry</button></div>
        : projects.data.length === 0 ? <p>No projects assigned yet.</p>
          : [...projects.data].sort((a, b) => a.name.localeCompare(b.name)).map((project) => <Link key={project.id} to={`/bugs?project=${project.id}`} className={selected === String(project.id) ? 'active' : ''} aria-current={selected === String(project.id) ? 'page' : undefined} title={project.name}><span>{project.name}</span></Link>)}
    </div>
  </details>
}



