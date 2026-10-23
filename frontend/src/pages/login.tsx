import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Bug, Check, Eye, EyeOff, GitPullRequest, ScanLine, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { endpoints } from '../api/client'
import { Button, Field, Input, Notice } from '../components/ui'

const schema = z.object({ user_id: z.string().trim().min(1, 'Enter your user ID'), password: z.string().min(1, 'Enter your password') })
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const [showPassword, setShowPassword] = useState(false)
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const login = useMutation({ mutationFn: (values: FormValues) => endpoints.login(values.user_id, values.password), onSuccess: (user) => {
    client.setQueryData(['me'], user)
    const requested = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    navigate(requested ?? (user.role === 'Admin' ? '/admin' : '/'), { replace: true })
  } })
  return <div className="login-page">
    <div className="login-art"><div className="login-art-content">
      <div className="brand brand-light"><span className="brand-mark"><Bug size={22} /></span><span>QA Desk<small>QUALITY, TOGETHER</small></span></div>
      <div className="login-story"><span className="login-kicker"><span /> A CLEARER PATH TO RELEASE</span><div className="art-title">Small details.<br /><em>Better releases.</em></div><p>Bring your team, issues, and progress into one focused workspace. From the first report to the final retest.</p></div>
      <div className="workflow-preview" aria-label="Report, resolve, and verify workflow">
        <div className="workflow-preview-heading"><span>THE QUALITY LOOP</span><span className="workflow-preview-dots">•••</span></div>
        <div className="workflow-preview-step"><span className="workflow-step-icon"><ScanLine size={19} /></span><div><b>Capture the details</b><small>Give every issue a clear starting point.</small></div><span className="workflow-step-number">01</span></div>
        <div className="workflow-preview-step"><span className="workflow-step-icon"><GitPullRequest size={19} /></span><div><b>Move the fix forward</b><small>Keep ownership and progress visible.</small></div><span className="workflow-step-number">02</span></div>
        <div className="workflow-preview-step"><span className="workflow-step-icon complete"><Check size={19} /></span><div><b>Verify with confidence</b><small>Close the loop with your QA team.</small></div><span className="workflow-step-number">03</span></div>
      </div>
      <div className="art-foot"><ShieldCheck size={17} /> A private workspace for your product team</div>
    </div></div>
    <div className="login-panel"><div className="login-box">
      <div className="mobile-brand"><div className="brand"><span className="brand-mark"><Bug size={21} /></span><span>QA Desk<small>QUALITY, TOGETHER</small></span></div></div>
      <span className="login-welcome-icon"><Bug size={25} /></span><p className="eyebrow">YOUR WORKSPACE AWAITS</p><h1>Welcome back.</h1><p className="muted login-intro">Sign in to keep quality moving forward.</p>
      {login.isError && <Notice>{login.error.message}</Notice>}
      <form onSubmit={handleSubmit(values => login.mutate(values))} className="login-form" noValidate>
        <Field label="User ID" error={errors.user_id?.message}><Input autoComplete="username" placeholder="e.g. alex.chen" aria-invalid={!!errors.user_id} {...register('user_id')} /></Field>
        <Field label="Password" error={errors.password?.message}><span className="password-input"><Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" aria-invalid={!!errors.password} {...register('password')} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></Field>
        <Button type="submit" disabled={login.isPending} className="sign-in">{login.isPending ? 'Signing in…' : 'Sign in to workspace'} <ArrowRight size={18} /></Button>
      </form>
      <p className="login-help">Need access? Contact your workspace administrator.</p>
      <p className="login-security"><ShieldCheck size={15} /> Organization accounts only</p>
    </div><footer className="login-footer">QA Desk <span>·</span> A little more clarity. A lot more quality.</footer></div>
  </div>
}
