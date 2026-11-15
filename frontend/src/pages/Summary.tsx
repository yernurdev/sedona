import { motion } from 'framer-motion'
import { ArrowUpRight, Briefcase, CalendarClock, ExternalLink, Landmark, ListChecks, Lock, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSummary } from '../api/hooks'
import CalcSteps, { shouldShowSteps } from '../components/CalcSteps'
import Checklist from '../components/Checklist'
import { ErrorBox, Estimate, HowCalc, Spinner } from '../components/ui'
import { days, fmtDate, optionName, usd } from '../lib/format'

const locked = [
  ['Week-by-week runway chart', 'See exactly which week cash runs out under each insurance option'],
  ['Every deadline in your calendar', 'Google Calendar export with weekly reminders'],
  ['Weekly check-in', 'Work search record formatted for your state portal'],
  ['Severance questions and HR email', 'What to ask before you sign'],
  ['Got an offer?', 'Offer after benefits, coverage bridge, clawback check'],
  ['Tax preview', 'What you will owe in April, before April'],
]

const ease = [0.22, 1, 0.36, 1] as const

function Stat({ k, children, delay }: { k: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.div className="retro-card flex flex-col p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease }}>
      <div className="text-[13px] font-medium text-ink-soft">{k}</div>
      <div className="mt-4 flex-1">{children}</div>
    </motion.div>
  )
}

export default function Summary() {
  const { caseId = '' } = useParams()
  const q = useSummary(caseId)
  const [steps, setSteps] = useState(() => shouldShowSteps(caseId))
  if (q.isLoading) return <Spinner />
  if (q.error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
  const s = q.data!
  if (steps) return <CalcSteps s={s} onDone={() => setSteps(false)} />
  const ins = s.insurance
  const save = ins.cobraMonthly - ins.cheapestMonthly
  const nd = s.nextDeadline
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mt-2 text-4xl font-[460] sm:text-6xl">Your three numbers</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">Calculated from your answers with 2026 federal and state rules, as of {fmtDate(s.currentDate)}.</p>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <Stat k="Health insurance per month" delay={0}>
          <div className="space-y-1">
            {(['cobra', 'aca', 'spouse'] as const).map((t) => {
              const v = t === 'cobra' ? ins.cobraMonthly : t === 'aca' ? ins.acaMonthly : ins.spouseMonthly
              if (t === 'spouse' && v == null) return null
              const best = ins.cheapest === t
              return (
                <div key={t} className={`flex items-baseline justify-between rounded-xl px-3 py-2.5 ${best ? 'bg-brand-soft' : ''}`}>
                  <span className={`text-sm ${best ? 'font-medium' : 'text-ink-soft'}`}>{optionName[t]}</span>
                  <span className={`num font-semibold ${best ? 'text-3xl text-brand-deep' : 'text-lg text-ink-soft'}`}>{usd(v)}</span>
                </div>
              )
            })}
          </div>
          {save > 0 && (
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Based on your numbers, {optionName[ins.cheapest]} costs <b className="text-ink">{usd(save)} less per month</b> than COBRA.
            </p>
          )}
          <div className="mt-3"><Estimate /></div>
        </Stat>

        <Stat k="Your money lasts" delay={0.06}>
          <div className="flex items-baseline gap-2">
            <span className="num text-6xl font-semibold text-brand-deep">{s.runway.months.toFixed(1)}</span>
            <span className="text-lg text-ink-soft">months</span>
          </div>
          <div className="mt-5 space-y-2 text-sm">
            {(['cobra', 'aca', 'spouse'] as const).map((t) =>
              s.runway.byOption[t] == null ? null : (
                <div key={t} className="flex justify-between border-t border-ink/[.06] pt-2">
                  <span className="text-ink-soft">With {optionName[t]}</span>
                  <span className="num font-medium">{s.runway.byOption[t]!.toFixed(1)} mo</span>
                </div>
              ),
            )}
          </div>
        </Stat>

        <Stat k="Next deadline" delay={0.12}>
          {nd ? (
            <>
              <div className={`num text-5xl font-semibold ${nd.daysLeft <= 7 ? 'text-wine' : 'text-brand-deep'}`}>{nd.daysLeft === 0 ? 'Today' : `${nd.daysLeft} days`}</div>
              <div className="mt-3 text-lg font-medium leading-snug">{nd.title}</div>
              <div className="mt-1 text-sm text-ink-soft">{fmtDate(nd.date)} · {days(nd.daysLeft)}</div>
              <p className="mt-4 text-sm text-ink-soft">{Math.max(0, s.deadlineCount - 1)} more deadlines in your full plan.</p>
            </>
          ) : (
            <div className="text-lg">No upcoming deadlines.</div>
          )}
        </Stat>
      </div>

      <section className="mt-14">
        <h2 className="text-3xl font-[460] sm:text-4xl">What else we found</h2>
        <p className="mt-2 text-ink-soft">Free, from the same calculation.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="retro-card p-6">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"><Landmark className="size-4 text-brand" /> Unemployment benefits</div>
            <div className="mt-3 flex items-baseline gap-2"><span className="num text-4xl font-[460] text-brand-deep">{usd(s.unemployment.weeklyBenefit)}</span><span className="text-ink-soft">/ week</span></div>
            <div className="mt-1 text-sm text-ink-soft">Up to {s.unemployment.maxWeeks} weeks · {usd(s.unemployment.totalPotential)} total{s.unemployment.waitingWeek ? ' · first week unpaid' : ''}</div>
            <p className="mt-4 text-sm leading-relaxed">{s.unemployment.workSearchRule}</p>
            <a href={s.unemployment.portalUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-deep hover:text-brand">Open state portal <ExternalLink className="size-3.5" /></a>
            <div className="mt-3"><Estimate /></div>
          </div>
          <div className="retro-card p-6">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"><Wallet className="size-4 text-brand" /> Severance after withholding</div>
            {s.severance.gross > 0 ? (
              <>
                <div className="mt-3 num text-4xl font-[460] text-brand-deep">{usd(s.severance.netEstimate)}</div>
                <div className="mt-1 text-sm text-ink-soft">of {usd(s.severance.gross)} gross · 22% federal, FICA and state withheld</div>
                {s.severance.signBy && <p className="mt-4 text-sm leading-relaxed">Decide by <b>{fmtDate(s.severance.signBy)}</b>. Don’t sign on day one: ask HR about extra pay and COBRA help first.</p>}
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">No severance entered.</p>
            )}
          </div>
          <div className="retro-card p-6">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"><CalendarClock className="size-4 text-brand" /> Coming up</div>
            <ul className="mt-3 divide-y divide-ink/[.06]">
              {s.upcoming.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <span>{d.title}</span>
                  <span className={`num shrink-0 ${d.daysLeft <= 7 ? 'font-medium text-wine' : 'text-ink-soft'}`}>{d.daysLeft === 0 ? 'today' : `${d.daysLeft}d`}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {s.acaQuotes && (
            <div className="retro-card p-6">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"><Briefcase className="size-4 text-brand" /> Your Marketplace math</div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="text-left text-[12.5px] text-ink-soft"><tr><th className="py-2 font-medium">Year</th><th className="font-medium">Projected income</th><th className="font-medium">Poverty line</th><th className="font-medium">Tax credit</th><th className="font-medium">You pay</th></tr></thead>
                  <tbody className="num">
                    {s.acaQuotes.map((q) => (
                      <tr key={q.year} className="border-t border-ink/[.06]"><td className="py-2.5">{q.year}</td><td>{usd(q.magi)}</td><td>{q.fplPct}%</td><td>{usd(q.subsidyMonthly)}/mo</td><td className="font-semibold text-brand-deep">{usd(q.netMonthly)}/mo</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">Subsidies follow your projected income for each calendar year, so the price changes on January 1. Exact plans at healthcare.gov.</p>
            </div>
          )}
          <div className="retro-card p-6">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"><ListChecks className="size-4 text-brand" /> Do today</div>
            <div className="mt-2"><Checklist items={s.firstSteps} storageKey={`sedona.today.${caseId}`} /></div>
          </div>
        </div>
      </section>

      <div className="retro-card-soft mt-4 p-6">
        <div className="font-medium">Why is the Marketplace so different from COBRA?</div>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{ins.why}</p>
        <HowCalc>
          <p><b className="text-ink">COBRA</b> = the full employer premium × 102% (federal rule). Without your COBRA letter we use the KFF 2026 average ($9,804 single / $28,303 family per year).</p>
          {ins.aca && (
            <p>
              <b className="text-ink">Marketplace {ins.aca.year}:</b> projected income {usd(ins.aca.magi)} is {ins.aca.fplPct}% of the federal poverty line for your household. {ins.aca.statusNote} Benchmark silver plan {usd(ins.aca.benchmarkMonthly)}/mo, tax credit {usd(ins.aca.subsidyMonthly)}/mo. The headline is the average over your next 6 months of coverage.
            </p>
          )}
          <p><b className="text-ink">Runway</b> = week-by-week simulation: savings + net severance + estimated unemployment − (expenses + insurance), assuming no new job.</p>
          <p>Sources: HHS poverty guidelines, IRS Rev. Proc. 2025-25, KFF premiums (state average, estimate), CMS age curve, state labor departments. <Link className="text-brand-deep underline" to="/how">All sources</Link></p>
        </HowCalc>
      </div>

      {s.paid ? (
        <div className="mt-10 flex justify-center">
          <Link to={`/plan/${caseId}`} className="btn btn-primary">Open your full plan <ArrowUpRight className="size-4" /></Link>
        </div>
      ) : (
        <section className="mt-14">
          <h2 className="text-2xl font-[460] sm:text-3xl">In your full plan</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locked.map(([t, d]) => (
              <div key={t} className="retro-card-soft p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{t}</div>
                  <Lock className="mt-0.5 size-4 shrink-0 text-ink-soft/60" />
                </div>
                <div className="mt-1 text-sm text-ink-soft">{d}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-col items-start justify-between gap-5 rounded-[16px] bg-ink p-7 text-white sm:flex-row sm:items-center sm:p-9">
            <div>
              <div className="text-2xl font-semibold">One insurance mistake costs $2,000–5,000.</div>
              <div className="mt-1 text-white/60">$39 for the first month, then $14.99/mo while you search. Cancel anytime.</div>
            </div>
            <Link to={`/pay/${caseId}`} className="btn btn-primary shrink-0">Unlock full plan <ArrowUpRight className="size-4" /></Link>
          </div>
        </section>
      )}
    </div>
  )
}
