import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { endpoints } from '../../api/client'
import { Button, Card, Field, Input, Notice, PageHeader, Select } from '../../components/ui'

export function ManagerTeamAccountsPage() {
  const client = useQueryClient()
  const [notice, setNotice] = useState('')
  const createUser = useMutation({
    mutationFn: endpoints.managerCreateUser,
    onSuccess: (user) => {
      client.invalidateQueries({ queryKey: ['manager-assignable-users'] })
      setNotice(`${user.full_name} created as ${user.role}. Assign the account to a project from Team assignments.`)
    },
  })

  const submitAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    createUser.reset()
    setNotice('')
    const formElement = event.currentTarget
    const values = new FormData(event.currentTarget)
    const full_name = String(values.get('full_name') ?? '').trim()
    const user_id = String(values.get('user_id') ?? '').trim()
    const password = String(values.get('password') ?? '')
    const role = String(values.get('role') ?? 'Tester')
    if (!full_name || !user_id || !password || !['Tester', 'Developer'].includes(role)) {
      setNotice('Enter a name, a user ID, a password, and choose Tester or Developer.')
      return
    }
    createUser.mutate({ full_name, user_id, password, role: role as 'Tester' | 'Developer' }, { onSuccess: () => formElement.reset() })
  }

  return <>
    <PageHeader eyebrow="WORKSPACE" title="Create team accounts" description="Create Tester and Developer logins here. Assign them to projects separately from Team assignments." />
    {(notice || createUser.isError) && <Notice tone={createUser.isError || notice.startsWith('Enter a name') ? 'error' : 'success'}>{createUser.error?.message ?? notice}</Notice>}
    <Card className="form-card">
      <div className="card-heading"><div><h3>New team account</h3><p>Set the team member’s name, login details, and role.</p></div><UserPlus size={18} /></div>
      <form className="form-grid" onSubmit={submitAccount}>
        <Field label="Full name"><Input name="full_name" required maxLength={200} placeholder="Team member name" /></Field>
        <Field label="User ID"><Input name="user_id" required minLength={2} maxLength={100} placeholder="Login user ID" /></Field>
        <Field label="Role"><Select name="role" defaultValue="Tester"><option value="Tester">Tester</option><option value="Developer">Developer</option></Select></Field>
        <Field label="Password"><Input name="password" type="password" required maxLength={128} autoComplete="new-password" placeholder="Enter a password" /></Field>
        <div className="form-actions"><Button type="submit" disabled={createUser.isPending}><UserPlus size={15} /> {createUser.isPending ? 'Creating account…' : 'Create account'}</Button></div>
      </form>
    </Card>
  </>
}
