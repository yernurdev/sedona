import { ArrowUpRight, FastForward } from 'lucide-react'
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
    <div className="bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
        <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Sample data</span>
        <span className="text-white/70">Demo mode · Jessica, 38, Austin TX, family of 3</span>
        <span className="num ml-auto text-white/90">Today {fmtDate(info.data.currentDate)}</span>
        <button
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-medium hover:bg-white/20 disabled:opacity-50"
          onClick={() => adv.mutate()}
          disabled={adv.isPending}
          title="Move the demo clock forward one week"
        >
          <FastForward className="size-3.5" /> +1 week
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
    <nav className="mx-auto mt-3 flex max-w-6xl gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
      {items.map(([label, to]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white hover:text-ink'}`
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
      <header className="sticky top-0 z-30 bg-cream/80 pb-3 pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex h-11 items-center rounded-full border border-ink/[.07] bg-white/80 px-3" aria-label="Sedona home">
            <img src="/logo.png" alt="Sedona" className="h-[54px] w-auto max-w-none" />
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-ink/[.07] bg-white/80 p-1 text-sm md:flex">
            <Link to="/how" className="rounded-full px-3.5 py-1.5 text-ink-soft hover:text-ink">How we calculate</Link>
            <Link to="/start" className="rounded-full px-3.5 py-1.5 text-ink-soft hover:text-ink">Start a plan</Link>
          </nav>
          <Link to="/start" className="btn btn-dark btn-sm h-11">
            Get started <ArrowUpRight className="size-4" />
          </Link>
        </div>
        {caseId && <CaseNav caseId={caseId} />}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-ink/[.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[13px] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl">{DISCLAIMER} We don’t sell insurance or take commissions.</p>
          <div className="flex gap-5">
            <Link to="/how" className="hover:text-ink">How we calculate</Link>
            <span>© Sedona 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
