import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input className={`input ${props.className ?? ''}`} {...props} /> }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={`input ${props.className ?? ''}`} {...props} /> }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={`input textarea ${props.className ?? ''}`} {...props} /> }
export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) { return <section className={`card ${className}`}>{children}</section> }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="muted page-description">{description}</p>}</div>{action}</div>
}
export function Field({ label, error, children }: PropsWithChildren<{ label: string; error?: string }>) {
  return <label className="field"><span>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}
export function Notice({ children, tone = 'error' }: PropsWithChildren<{ tone?: 'error' | 'success' | 'info' }>) { return <div className={`notice notice-${tone}`} role="status">{children}</div> }
