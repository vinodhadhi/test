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
      <span className="project-menu-count" aria-label={`${projects.data?.length ?? 0} projects`}>{projects.isSuccess ? projects.data.length : '—'}</span><ChevronDown size={15} />
    </summary>
    <div className="developer-project-submenu">
      {projects.isPending ? <p role="status">Loading projects…</p> : projects.isError ? <div role="alert"><p>Could not load projects.</p><button type="button" onClick={(event) => { event.stopPropagation(); projects.refetch() }}>Retry</button></div>
        : projects.data.length === 0 ? <p>No projects assigned yet.</p>
          : [...projects.data].sort((a, b) => a.name.localeCompare(b.name)).map((project) => <details className="developer-project-entry" key={project.id}>
            <summary onClick={(event) => event.stopPropagation()}><span>{project.name}</span><ChevronDown size={15} /></summary>
            <div className="developer-project-queue"><Link to={`/bugs?project=${project.id}`} className={selected === String(project.id) ? 'active' : ''} aria-current={selected === String(project.id) ? 'page' : undefined} aria-label={`My queue for ${project.name}`}>My queue</Link></div>
          </details>)}
    </div>
  </details>
}
