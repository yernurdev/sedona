import { FastForward, FlaskConical } from 'lucide-react'
import { Link, NavLink, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAdvance, useCaseInfo } from '../api/hooks'
import { fmtDate } from '../lib/format'

export const DISCLAIMER = 'Educational calculations, not legal, tax or insurance advice. Verify with official sources.'

function DemoBar({ caseId }: { caseId: string }) {
  const info = useCaseInfo(caseId)
  const adv = useAdvance(caseId)
  if (!info.data?.isSample) return null
  return (
    <div className="border-b border-ink bg-sky">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <span className="mono-label inline-flex items-center gap-1.5 font-bold">
          <FlaskConical className="size-3.5" /> Sample data · Demo mode
        </span>
        <span className="text-ink-soft">Jessica, 38, Austin TX · family of 3</span>
        <span className="num ml-auto text-ink">Today: {fmtDate(info.data.currentDate)}</span>
        <button className="btn btn-sm bg-cream" onClick={() => adv.mutate()} disabled={adv.isPending} title="Move the demo clock forward one week">
          <FastForward className="size-4" /> +1 week
        </button>
      </div>
    </div>
  )
}

function CaseNav({ caseId }: { caseId: string }) {
  const info = useCaseInfo(caseId)
  if (!info.data?.paid) return null
  const items = [
    ['Plan', `/plan/${caseId}`],
    ['Weekly check-in', `/checkin/${caseId}`],
    ['Got an offer?', `/offer/${caseId}`],
    ['Tax preview', `/tax/${caseId}`],
  ]
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
      {items.map(([label, to]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${isActive ? 'border-ink bg-ink text-cream' : 'border-line bg-white/60 hover:border-ink'}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { caseId } = useParams()
  return (
    <div className="flex min-h-dvh flex-col">
      {caseId && <DemoBar caseId={caseId} />}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center" aria-label="Sedona home">
            <img src="/logo.png" alt="Sedona" className="h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/how" className="mono-label hidden text-ink-soft hover:text-wine sm:inline">
              How we calculate
            </Link>
            <Link to="/start" className="btn btn-primary btn-sm">
              Start
            </Link>
          </div>
        </div>
        {caseId && <CaseNav caseId={caseId} />}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-cream-deep/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl">{DISCLAIMER} We don't sell insurance or take commissions.</p>
          <div className="flex gap-4">
            <Link to="/how" className="underline">How we calculate</Link>
            <span className="mono-label">© Sedona 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
