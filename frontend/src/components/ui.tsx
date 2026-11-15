import clsx from 'clsx'
import { AlertTriangle, Info, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export function Tag({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'brand' | 'wine' | 'sky' | 'ok' | 'muted' }) {
  return (
    <span
      className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium', {
        'bg-ink text-white': tone === 'ink',
        'bg-wine/10 text-wine-deep': tone === 'wine',
        'bg-brand-soft text-brand-deep': tone === 'brand' || tone === 'sky',
        'bg-ok/10 text-ok': tone === 'ok',
        'bg-ink/[.05] text-ink-soft': tone === 'muted',
      })}
    >
      {children}
    </span>
  )
}

export const Estimate = () => <Tag tone="muted">estimate</Tag>

export function Spinner({ label = 'Calculating' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-ink-soft" role="status">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">{label}…</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-wine/20 bg-wine/[.04] p-4 text-sm" role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-wine" />
      <div className="flex-1">{msg}</div>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function HowCalc({ title = 'How we calculated this', children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-deep hover:text-brand"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Info className="size-3.5" /> {title}
      </button>
      {open && <div className="mt-3 space-y-2 rounded-2xl bg-cream p-4 text-sm leading-relaxed text-ink-soft">{children}</div>}
    </div>
  )
}

export function Src({ href, children = 'source' }: { href?: string; children?: ReactNode }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">
      {children}
    </a>
  )
}

export function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[13px] font-medium text-brand-deep">{kicker}</div>
      <h2 className="mt-1.5 text-3xl font-semibold sm:text-4xl">{title}</h2>
      {children && <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">{children}</p>}
    </div>
  )
}
