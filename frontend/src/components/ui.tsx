import { Component, forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type PropsWithChildren, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...props }, ref) {
  return <input {...props} ref={ref} className={`input ${className}`} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', ...props }, ref) {
  return <select {...props} ref={ref} className={`input ${className}`} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...props }, ref) {
  return <textarea {...props} ref={ref} className={`input textarea ${className}`} />
})
export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) { return <section className={`card ${className}`}>{children}</section> }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="muted page-description">{description}</p>}</div>{action}</div>
}
export function Field({ label, error, children }: PropsWithChildren<{ label: string; error?: string }>) {
  return <label className="field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}
export function Notice({ children, tone = 'error' }: PropsWithChildren<{ tone?: 'error' | 'success' | 'info' }>) { return <div className={`notice notice-${tone}`} role="status">{children}</div> }

export function RouteLoading() {
  return <div className="route-loading" role="status" aria-label="Loading workspace"><div className="spinner" /><p>Getting your workspace ready…</p><div className="loading-skeleton"><i /><i /><i /></div></div>
}

export class PageErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div className="route-loading" role="alert"><h2>This page couldn't load.</h2><p>Reload to get the latest version of your workspace.</p><Button onClick={() => window.location.reload()}>Reload page</Button></div>
    return this.props.children
  }
}
