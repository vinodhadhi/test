import { Plus } from 'lucide-react'
import type { User } from '../../api/client'
import { Button, Select } from '../../components/ui'

export function TeamRolePicker({ role, users, value, onChange, onAdd }: { role: 'Tester' | 'Developer'; users: User[]; value: string; onChange: (value: string) => void; onAdd: (userId: number) => void }) {
  return <div className="team-role-picker"><label htmlFor={`team-${role.toLowerCase()}`}>{role}</label><Select id={`team-${role.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)} disabled={!users.length}><option value="">{users.length ? `Choose ${role.toLowerCase()}` : `All ${role.toLowerCase()}s selected`}</option>{users.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}</Select><Button type="button" variant="secondary" disabled={!value} onClick={() => { onAdd(Number(value)); onChange('') }}><Plus size={14} /> Add</Button></div>
}
