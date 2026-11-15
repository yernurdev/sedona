import { ArrowUpRight, FastForward } from 'lucide-react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAdvance, useCaseInfo } from '../api/hooks'
import { fmtDate } from '../lib/format'

export const DISCLAIMER = 'Educational calculations, not legal, tax or insurance advice. Verify with official sources.'

function DemoBar({ caseId }: { caseId: string }) {
  const info = useCaseInfo(caseId)
  const adv = useAdvance(caseId)
  if (!info.data?.isSample) return null
  return (
    <div className="bg-[#1B1D1F] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
        <span className="rounded-[6px] bg-brand px-1.5 py-0.5 text-[11px] font-semibold">SAMPLE DATA</span>
        <span className="text-white/60">Demo mode · Jessica, 38, Austin TX, family of 3</span>
        <span className="num ml-auto text-white/80">Today {fmtDate(info.data.currentDate)}</span>
        <button
          className="inline-flex items-center gap-1.5 rounded-[8px] bg-white/10 px-2.5 py-1 font-medium hover:bg-white/20 disabled:opacity-50"
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
    <nav className="mx-auto mt-2 flex max-w-6xl gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
      {items.map(([label, to]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[13.5px] font-medium transition-colors ${isActive ? 'bg-[#1B1D1F] text-white' : 'text-ink-soft hover:bg-white/70 hover:text-ink'}`
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
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <div className="flex min-h-dvh flex-col">
      {caseId && <DemoBar caseId={caseId} />}
      <header className={`sticky top-0 z-30 py-3 transition-[background-color,border-color,backdrop-filter] duration-200 ${scrolled ? 'border-b border-ink/[.06] bg-cream/85 backdrop-blur-xl' : 'border-b border-transparent'}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex h-11 items-center rounded-[12px] bg-white/85 px-3 shadow-[0_1px_2px_rgb(0_0_0/.04)] backdrop-blur" aria-label="Sedona home">
            <img src="/logo.png" alt="Sedona" className="h-[52px] w-auto max-w-none" />
          </Link>
          <nav className="hidden h-11 items-center gap-1 rounded-[15px] bg-[#EDEDEE]/90 px-2 text-[13px] backdrop-blur md:flex">
            <Link to="/how" className="rounded-[9px] px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">How we calculate</Link>
            <Link to="/start" className="rounded-[9px] px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">Start a plan</Link>
          </nav>
          <Link to="/start" className="btn btn-dark btn-sm h-11">
            Get started <span className="arrow"><ArrowUpRight className="size-3.5" /></span>
          </Link>
        </div>
        {caseId && <CaseNav caseId={caseId} />}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-20 border-t border-ink/[.06]">
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
