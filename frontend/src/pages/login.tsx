import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bug, ShieldCheck } from 'lucide-react'
import type { FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { endpoints } from '../api/client'
import { Button, Field, Input, Notice } from '../components/ui'

const schema = z.object({ user_id: z.string().min(1, 'Enter your user ID'), password: z.string().min(1, 'Enter your password') })
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { register, setError, clearErrors, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const login = useMutation({ mutationFn: (values: FormValues) => endpoints.login(values.user_id, values.password), onSuccess: (user) => {
    client.setQueryData(['me'], user)
    const requested = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    navigate(requested ?? (user.role === 'Admin' ? '/admin' : '/'), { replace: true })
  } })
  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const user_id = String(fields.get('user_id') ?? '').trim()
    const password = String(fields.get('password') ?? '')
    clearErrors()
    if (!user_id) {
      setError('user_id', { type: 'required', message: 'Enter your user ID' })
      return
    }
    if (!password) {
      setError('password', { type: 'required', message: 'Enter your password' })
      return
    }
    login.mutate({ user_id, password })
  }
  return <div className="login-page"><div className="login-art"><div className="login-art-content"><div className="brand brand-light"><span className="brand-mark"><Bug size={20} /></span><span>QA Desk<small>BUG TRACKING</small></span></div><div className="art-title">Quality moves<br />work forward.</div><p>One clear view of every issue, fix, and release milestone.</p><div className="art-foot"><ShieldCheck size={17} /> A private workspace for your product team</div></div><div className="art-decoration deco-one" /><div className="art-decoration deco-two" /></div>
    <div className="login-panel"><div className="login-box"><div className="mobile-brand"><div className="brand"><span className="brand-mark"><Bug size={19} /></span><span>QA Desk<small>BUG TRACKING</small></span></div></div><p className="eyebrow">WELCOME BACK</p><h1>Sign in to QA Desk</h1><p className="muted login-intro">Use your organization account to continue.</p>
      {login.isError && <Notice>{login.error.message}</Notice>}
      <form onSubmit={submitLogin} className="login-form"><Field label="User ID" error={errors.user_id?.message}><Input autoComplete="username" placeholder="e.g. alex.chen" {...register('user_id')} /></Field><Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" placeholder="Enter your password" {...register('password')} /></Field><Button type="submit" disabled={login.isPending} className="sign-in">{login.isPending ? 'Signing in…' : 'Sign in'} <span>→</span></Button></form><p className="login-security"><ShieldCheck size={15} /> Your session is encrypted and secure</p>
    </div><footer className="login-footer">Internal use only <span>·</span> QA Desk</footer></div>
  </div>
}
