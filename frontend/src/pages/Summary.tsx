import { motion } from 'framer-motion'
import { ArrowRight, Lock } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useSummary } from '../api/hooks'
import { ErrorBox, Estimate, HowCalc, Spinner, Tag } from '../components/ui'
import { days, fmtDate, optionName, usd } from '../lib/format'

const locked = [
  ['Full insurance comparison', 'COBRA vs Marketplace vs spouse, with the retroactive COBRA trick'],
  ['Every deadline + calendar', 'Export to Google Calendar with weekly reminders'],
  ['Weekly check-in', 'Ready-to-paste work search record for your state'],
  ['Severance questions + HR letter', 'What to ask before you sign'],
  ['Got an offer?', 'Offer net of benefits, coverage bridge, clawback warning'],
  ['Tax preview', 'What you’ll owe in April, before April'],
]

function Big({ k, children, sub, delay }: { k: string; children: React.ReactNode; sub?: React.ReactNode; delay: number }) {
  return (
    <motion.div
      className="retro-card scan relative flex flex-col p-6"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="mono-label text-ink-soft">{k}</div>
      <div className="mt-3 flex-1">{children}</div>
      {sub && <div className="mt-4 text-sm text-ink-soft">{sub}</div>}
    </motion.div>
  )
}

export default function Summary() {
  const { caseId = '' } = useParams()
  const q = useSummary(caseId)
  if (q.isLoading) return <Spinner />
  if (q.error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
  const s = q.data!
  const ins = s.insurance
  const save = ins.cobraMonthly - ins.cheapestMonthly
  const nd = s.nextDeadline
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center gap-2">
        {s.isSample && <Tag tone="sky">Sample data</Tag>}
        <Tag tone="muted">as of {fmtDate(s.currentDate)}</Tag>
      </div>
      <h1 className="mt-3 text-3xl font-bold sm:text-5xl">Your three numbers</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Calculated from your answers with 2026 federal and state rules. Here’s what matters most this week.</p>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <Big k="01 · Health insurance / month" delay={0}>
          <div className="space-y-3">
            {(['cobra', 'aca', 'spouse'] as const).map((t) => {
              const v = t === 'cobra' ? ins.cobraMonthly : t === 'aca' ? ins.acaMonthly : ins.spouseMonthly
              if (t === 'spouse' && v == null) return null
              const best = ins.cheapest === t
              return (
                <div key={t} className={`flex items-baseline justify-between rounded-xl px-3 py-2 ${best ? 'bg-sky/60 ring-1 ring-brand' : ''}`}>
                  <span className="text-sm font-medium">{optionName[t]}</span>
                  <span className={`num font-bold ${best ? 'text-3xl' : 'text-xl text-ink-soft line-through decoration-wine/50'}`}>{usd(v)}</span>
                </div>
              )
            })}
          </div>
          {save > 0 && (
            <p className="mt-3 text-sm">
              Based on your numbers, <b>{optionName[ins.cheapest]}</b> costs <b className="text-brand">{usd(save)}/mo less</b> than COBRA.
            </p>
          )}
          <div className="mt-2"><Estimate /></div>
        </Big>

        <Big k="02 · Your money lasts" delay={0.08}>
          <div className="num text-6xl font-bold leading-none">{s.runway.months.toFixed(1)}</div>
          <div className="mt-1 text-lg">months</div>
          <div className="mt-4 space-y-1 text-sm">
            {(['cobra', 'aca', 'spouse'] as const).map((t) =>
              s.runway.byOption[t] == null ? null : (
                <div key={t} className="flex justify-between border-b border-dashed border-line py-1">
                  <span className="text-ink-soft">with {optionName[t]}</span>
                  <span className="num font-semibold">{s.runway.byOption[t]!.toFixed(1)} mo</span>
                </div>
              ),
            )}
          </div>
        </Big>

        <Big k="03 · Next deadline" delay={0.16}>
          {nd ? (
            <>
              <div className={`num text-5xl font-bold leading-none ${nd.daysLeft <= 7 ? 'text-wine' : ''}`}>{nd.daysLeft === 0 ? 'Today' : `${nd.daysLeft}d`}</div>
              <div className="mt-3 text-lg font-semibold leading-snug">{nd.title}</div>
              <div className="mt-1 text-sm text-ink-soft">{fmtDate(nd.date)} · {days(nd.daysLeft)}</div>
            </>
          ) : (
            <div className="text-lg">No upcoming deadlines.</div>
          )}
          <p className="mt-3 text-sm">+ {Math.max(0, s.deadlineCount - 1)} more deadlines in your full plan.</p>
        </Big>
      </div>

      <div className="retro-card-soft mt-6 p-5">
        <div className="font-semibold">Why is the Marketplace so different from COBRA?</div>
        <p className="mt-1 text-sm text-ink-soft">{ins.why}</p>
        <HowCalc>
          <p><b>COBRA</b> = the full employer premium × 102% (federal rule). Without your COBRA letter we use the KFF 2026 average ($9,804 single / $28,303 family per year).</p>
          {ins.aca && (
            <p>
              <b>Marketplace {ins.aca.year}:</b> projected income {usd(ins.aca.magi)} = <b>{ins.aca.fplPct}%</b> of the federal poverty line for your household.{' '}
              {ins.aca.statusNote} Benchmark silver plan for your household: {usd(ins.aca.benchmarkMonthly)}/mo, tax credit {usd(ins.aca.subsidyMonthly)}/mo. We show the average over your next 6 months of coverage.
            </p>
          )}
          <p><b>Runway</b> = week-by-week simulation: savings + net severance + estimated unemployment benefits − (expenses + insurance), assuming no new job.</p>
          <p>Sources: HHS poverty guidelines, IRS Rev. Proc. 2025-25, KFF benchmark premiums (state average, estimate), CMS age curve, state labor departments. <Link className="text-brand underline" to="/how">All sources</Link></p>
        </HowCalc>
      </div>

      {s.paid ? (
        <div className="mt-8 flex justify-center">
          <Link to={`/plan/${caseId}`} className="btn btn-primary">Open your full plan <ArrowRight className="size-4" /></Link>
        </div>
      ) : (
        <section className="mt-10">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locked.map(([t, d]) => (
              <div key={t} className="relative overflow-hidden rounded-2xl border border-line bg-white/70 p-4">
                <Lock className="absolute right-4 top-4 size-4 text-ink-soft" />
                <div className="font-semibold">{t}</div>
                <div className="mt-1 text-sm text-ink-soft blur-[0.3px]">{d}</div>
              </div>
            ))}
          </div>
          <div className="retro-card mt-6 flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
            <div className="flex-1">
              <div className="text-xl font-semibold">One insurance mistake costs $2,000–5,000. Sedona costs $39.</div>
              <div className="mt-1 text-sm text-ink-soft">$39 for the first month (survival kit + weekly check-ins), then $14.99/mo while you search. Cancel anytime.</div>
            </div>
            <Link to={`/pay/${caseId}`} className="btn btn-primary shrink-0">Unlock full plan <ArrowRight className="size-4" /></Link>
          </div>
        </section>
      )}
    </div>
  )
}
