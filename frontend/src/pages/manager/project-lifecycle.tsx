import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { endpoints, type Project } from '../../api/client'
import { Button, Field, Input, Notice, Select, Textarea } from '../../components/ui'

const stages = ['Planning', 'In progress', 'Testing', 'Ready for release', 'Released', 'On hold']

export function ProjectLifecyclePanel({ project }: { project: Project }) {
  const client = useQueryClient()
  const [stage, setStage] = useState(project.lifecycle_stage || 'Planning')
  const [startDate, setStartDate] = useState(project.start_date || '')
  const [targetDate, setTargetDate] = useState(project.target_date || '')
  const [note, setNote] = useState(project.health_note || '')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setStage(project.lifecycle_stage || 'Planning')
    setStartDate(project.start_date || '')
    setTargetDate(project.target_date || '')
    setNote(project.health_note || '')
  }, [project.lifecycle_stage, project.start_date, project.target_date, project.health_note])
  const summary = useQuery({ queryKey: ['manager-project-lifecycle', project.id], queryFn: () => endpoints.managerProjectLifecycle(project.id) })
  const save = useMutation({
    mutationFn: () => endpoints.managerUpdateLifecycle(project.id, { lifecycle_stage: stage, start_date: startDate || null, target_date: targetDate || null, health_note: note.trim() || null }),
    onSuccess: () => { setSaved(true); client.invalidateQueries({ queryKey: ['manager-projects'] }) },
  })
  const data = summary.data
  const targetPassed = Boolean(targetDate && targetDate < new Date().toISOString().slice(0, 10) && stage !== 'Released')
  const daysUntilTarget = targetDate ? Math.ceil((new Date(`${targetDate}T00:00:00`).getTime() - new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`).getTime()) / 86400000) : null
  return <section className="project-lifecycle-panel" aria-label={`${project.name} lifecycle`}>
    <div className="section-heading"><div><h3>Project lifecycle</h3><span>Plan milestones and review QA health</span></div></div>
    <div className="lifecycle-grid">
      <div className="lifecycle-plan">
        <div className={`lifecycle-deadline${targetPassed ? ' overdue' : ''}`}><span>Project deadline</span><strong>{targetDate ? new Date(`${targetDate}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'No deadline set'}</strong><small>{targetDate ? stage === 'Released' ? 'Project released' : targetPassed ? `${Math.abs(daysUntilTarget ?? 0)} days overdue` : daysUntilTarget === 0 ? 'Due today' : `${daysUntilTarget} days remaining · Daily reminder at 9:00 AM` : 'Set a target date to enable daily reminders at 9:00 AM'}</small></div>
        <div className="lifecycle-fields">
          <Field label="Stage"><Select value={stage} onChange={(event) => { setStage(event.target.value); setSaved(false) }}>{stages.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Start date"><Input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setSaved(false) }} /></Field>
          <Field label="Target date"><Input type="date" min={startDate || undefined} value={targetDate} onChange={(event) => { setTargetDate(event.target.value); setSaved(false) }} /></Field>
        </div>
        <Field label="Manager assessment"><Textarea rows={3} maxLength={2000} placeholder="Record blockers, risks, or the next milestone" value={note} onChange={(event) => { setNote(event.target.value); setSaved(false) }} /></Field>
        {targetPassed && <Notice tone="info">The target date has passed. Review the stage and remaining issues.</Notice>}
        {save.isError && <Notice>{save.error.message}</Notice>}
        <div className="lifecycle-save"><Button type="button" variant="secondary" disabled={save.isPending || Boolean(startDate && targetDate && targetDate < startDate)} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save lifecycle'}</Button>{saved && <span>Saved</span>}</div>
      </div>
      <div className="lifecycle-health">
        {summary.isPending ? <p>Loading project health…</p> : summary.isError ? <Notice>{summary.error.message} <Button type="button" variant="secondary" onClick={() => summary.refetch()}>Retry</Button></Notice> : data && <>
          <div className="lifecycle-metrics"><div><strong>{data.verification_percent}%</strong><span>Issues verified</span></div><div><strong>{data.unresolved}</strong><span>Unresolved</span></div><div><strong>{data.high_priority_unresolved}</strong><span>High severity open</span></div><div><strong>{data.member_count}</strong><span>Team members</span></div></div>
          <div className="lifecycle-progress" role="progressbar" aria-label="Issues verified" aria-valuenow={data.verification_percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${data.verification_percent}%` }} /></div>
          <p>{data.total} issues across {data.module_count} modules · {data.fixed} awaiting verification · {data.reopened} reopened</p>
          <small>{data.last_issue_activity ? `Latest issue activity: ${new Date(data.last_issue_activity).toLocaleDateString()}` : 'No issue activity yet'}</small>
        </>}
      </div>
    </div>
  </section>
}
