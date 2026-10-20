import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Search, ShieldCheck, UserRoundX, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { endpoints, type Role, type User } from '../../api/client'
import { Button, Card, Field, Input, Notice, PageHeader, Select } from '../../components/ui'

const schema = z.object({ user_id: z.string().trim().min(2).max(100), full_name: z.string().trim().min(1).max(200), role: z.enum(['Admin', 'Manager', 'Tester', 'Developer']), password: z.string().min(1, 'Enter a password').max(128) })
type Values = z.infer<typeof schema>

export function UsersPage() {
  const client = useQueryClient()
  const users = useQuery({ queryKey: ['users'], queryFn: endpoints.users })
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [notice, setNotice] = useState('')
  const createForm = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { role: 'Tester' } })
  const passwordForm = useForm<{ new_password: string }>({ resolver: zodResolver(z.object({ new_password: z.string().min(1, 'Enter a password').max(128) })) })
  const editForm = useForm<{ user_id: string; full_name: string }>({ resolver: zodResolver(z.object({ user_id: z.string().trim().min(2).max(100), full_name: z.string().trim().min(1).max(200) })) })
  const invalidate = () => client.invalidateQueries({ queryKey: ['users'] })
  const create = useMutation({ mutationFn: endpoints.createUser, onSuccess: () => { invalidate(); createForm.reset({ role: 'Tester' }); setCreating(false); setNotice('Account created successfully.') } })
  const update = useMutation({ mutationFn: ({ id, data }: { id: number; data: Parameters<typeof endpoints.updateUser>[1] }) => endpoints.updateUser(id, data), onSuccess: invalidate })
  const saveEdit = useMutation({ mutationFn: ({ id, data }: { id: number; data: { user_id: string; full_name: string } }) => endpoints.updateUser(id, data), onSuccess: () => { invalidate(); setEditTarget(null); setNotice('Account updated successfully.') } })
  const resetPassword = useMutation({ mutationFn: ({ id, password }: { id: number; password: string }) => endpoints.resetPassword(id, password), onSuccess: () => { setNotice('Password reset successfully.'); setResetTarget(null); passwordForm.reset() } })
  const filtered = useMemo(() => (users.data ?? []).filter((u) => `${u.full_name} ${u.user_id} ${u.role}`.toLowerCase().includes(search.toLowerCase())), [users.data, search])
  const error = users.error ?? create.error ?? update.error ?? resetPassword.error ?? saveEdit.error
  const onSubmit = createForm.handleSubmit((values) => create.mutate(values))
  const handleReset = (user: User) => { setResetTarget(user); passwordForm.reset() }
  return <>
    <PageHeader eyebrow="PEOPLE" title="Users" description="Create and manage the people who work in your QA workspace." action={<Button onClick={() => setCreating((v) => !v)}><Plus size={16} /> Add user</Button>} />
    {notice && <Notice tone="success">{notice}</Notice>}{error && <Notice>{error.message}</Notice>}
    {creating && <Card className="form-card"><div className="card-heading"><div><h3>New account</h3><p>Give a teammate access to QA Desk.</p></div><Button variant="ghost" onClick={() => { setCreating(false); create.reset() }}>Close</Button></div><form className="form-grid" onSubmit={onSubmit}>
      <Field label="Full name" error={createForm.formState.errors.full_name?.message}><Input placeholder="e.g. Jordan Lee" {...createForm.register('full_name')} /></Field>
      <Field label="User ID" error={createForm.formState.errors.user_id?.message}><Input placeholder="e.g. jordan.lee" {...createForm.register('user_id')} /></Field>
      <Field label="Role" error={createForm.formState.errors.role?.message}><Select {...createForm.register('role')}><option value="Tester">Tester</option><option value="Developer">Developer</option><option value="Manager">Manager</option><option value="Admin">Admin</option></Select></Field>
      <Field label="Temporary password" error={createForm.formState.errors.password?.message}><Input type="password" autoComplete="new-password" placeholder="Enter a password" {...createForm.register('password')} /></Field>
      <div className="form-actions"><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create account'}</Button></div>
    </form></Card>}
    <Card className="table-card"><div className="table-toolbar"><div><h3>Team directory</h3><p>{users.data?.length ?? 0} accounts</p></div><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" /></label></div>
      {users.isPending ? <div className="loading-row">Loading users…</div> : users.isError ? <div className="empty-state"><UsersRound /><b>Could not load users</b><Button variant="secondary" onClick={() => users.refetch()}>Retry</Button></div> : filtered.length === 0 ? <div className="empty-state"><UsersRound /><b>{search ? 'No matching users' : 'No team members yet'}</b><span>{search ? 'Try another search.' : 'Create an account to start building your team.'}</span>{!search && <Button variant="secondary" onClick={() => setCreating(true)}>Add first user</Button>}</div> : <div className="table-scroll"><table><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>STATUS</th><th className="actions-col">ACTIONS</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><div className="user-cell"><div className="avatar avatar-small">{user.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><b>{user.full_name}</b><small>{user.user_id}</small></div></div></td><td><Select aria-label={`Role for ${user.full_name}`} value={user.role} onChange={(e) => update.mutate({ id: user.id, data: { role: e.target.value as Role } })}><option>Admin</option><option>Manager</option><option>Tester</option><option>Developer</option></Select></td><td><span className={`pill ${user.is_active ? 'pill-active' : 'pill-inactive'}`}><i />{user.is_active ? 'Active' : 'Inactive'}</span></td><td><div className="row-actions"><Button variant="ghost" onClick={() => { setEditTarget(user); editForm.reset({ user_id: user.user_id, full_name: user.full_name }) }} title="Edit account" aria-label={`Edit ${user.full_name}`}><Pencil size={16} /></Button><Button variant="ghost" onClick={() => handleReset(user)} title="Reset password" aria-label={`Reset password for ${user.full_name}`}><KeyRound size={16} /></Button><Button variant="ghost" onClick={() => update.mutate({ id: user.id, data: { is_active: !user.is_active } })} title={user.is_active ? 'Deactivate account' : 'Reactivate account'} aria-label={`${user.is_active ? 'Deactivate' : 'Reactivate'} ${user.full_name}`}><UserRoundX size={16} /></Button></div></td></tr>)}</tbody></table></div>}
      <div className="table-foot"><ShieldCheck size={14} /> User roles and access are enforced by the server.</div>
    </Card>
    {resetTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetTarget(null) }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-heading"><button className="modal-close" onClick={() => setResetTarget(null)} aria-label="Close">×</button><div className="modal-icon"><KeyRound size={18} /></div><h2 id="reset-heading">Reset password</h2><p className="muted">Set a new password for <b>{resetTarget.full_name}</b>.</p>{resetPassword.isError && <Notice>{resetPassword.error.message}</Notice>}<form onSubmit={passwordForm.handleSubmit(({ new_password }) => resetPassword.mutate({ id: resetTarget.id, password: new_password }))}><Field label="New password" error={passwordForm.formState.errors.new_password?.message}><Input autoFocus type="password" autoComplete="new-password" placeholder="Enter a password" {...passwordForm.register('new_password')} /></Field><div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setResetTarget(null)}>Cancel</Button><Button type="submit" disabled={resetPassword.isPending}>{resetPassword.isPending ? 'Saving…' : 'Set password'}</Button></div></form></section></div>}
    {editTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditTarget(null) }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-heading"><button className="modal-close" onClick={() => setEditTarget(null)} aria-label="Close">×</button><div className="modal-icon"><Pencil size={17} /></div><h2 id="edit-heading">Edit account</h2><p className="muted">Update {editTarget.full_name}’s profile details.</p>{saveEdit.isError && <Notice>{saveEdit.error.message}</Notice>}<form onSubmit={editForm.handleSubmit((data) => saveEdit.mutate({ id: editTarget.id, data }))}><Field label="Full name" error={editForm.formState.errors.full_name?.message}><Input autoFocus {...editForm.register('full_name')} /></Field><Field label="User ID" error={editForm.formState.errors.user_id?.message}><Input {...editForm.register('user_id')} /></Field><div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setEditTarget(null)}>Cancel</Button><Button type="submit" disabled={saveEdit.isPending}>{saveEdit.isPending ? 'Saving…' : 'Save changes'}</Button></div></form></section></div>}
  </>
}
