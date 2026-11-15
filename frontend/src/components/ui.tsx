import clsx from 'clsx'
import { AlertTriangle, Info, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export function Tag({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'wine' | 'sky' | 'ok' | 'muted' }) {
  return (
    <span
      className={clsx('mono-label inline-flex items-center gap-1 rounded-full border px-2.5 py-1 !text-[10px] whitespace-nowrap', {
        'border-ink bg-ink text-cream': tone === 'ink',
        'border-wine bg-wine/10 text-wine': tone === 'wine',
        'border-sky-deep bg-sky/60 text-ink': tone === 'sky',
        'border-ok/40 bg-ok/10 text-ok': tone === 'ok',
        'border-line bg-white text-ink-soft': tone === 'muted',
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
      <span className="mono-label">{label}…</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="retro-card-soft flex items-start gap-3 border-wine/40 p-4 text-sm" role="alert">
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
        className="mono-label inline-flex items-center gap-1.5 text-ink-soft underline decoration-dotted underline-offset-4 hover:text-wine"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Info className="size-3.5" /> {title}
      </button>
      {open && <div className="mt-3 space-y-2 rounded-2xl bg-cream-deep/70 p-4 text-sm leading-relaxed text-ink-soft">{children}</div>}
    </div>
  )
}

export function Src({ href, children = 'source' }: { href?: string; children?: ReactNode }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-wine underline underline-offset-2">
      {children}
    </a>
  )
}

export function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mono-label text-wine">{kicker}</div>
      <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">{title}</h2>
      {children && <p className="mt-2 max-w-2xl text-ink-soft">{children}</p>}
    </div>
  )
}
