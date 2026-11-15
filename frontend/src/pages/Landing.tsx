import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowUpRight, CalendarCheck, HeartPulse, LineChart, Receipt } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { post } from '../api/client'
import { ErrorBox } from '../components/ui'

const ease = [0.22, 1, 0.36, 1] as const

const steps = [
  { icon: HeartPulse, k: 'Day 0', t: 'Health insurance, decoded', d: 'COBRA, the Marketplace and your spouse’s plan, priced on the income you will actually have this year.' },
  { icon: CalendarCheck, k: 'Every week', t: 'Never miss a benefit check', d: 'Log job-search activities in seconds and get a record formatted for your state portal.' },
  { icon: LineChart, k: 'The offer', t: 'Leave without a surprise', d: 'Compare offers after benefits, bridge the coverage gap and catch a subsidy clawback early.' },
  { icon: Receipt, k: 'Tax day', t: 'Know before April', d: 'Tax on unemployment and severance plus the Marketplace reconciliation, ahead of filing.' },
]

const facts = [
  ['$2,406', 'per month', 'Average family COBRA premium in 2026 (KFF, ×102%)'],
  ['400%', 'of poverty line', 'Above it, Marketplace subsidies stop entirely since 2026'],
  ['$0', 'repayment cap', 'Excess subsidy is repaid in full from tax year 2026 (IRS)'],
]

function Preview() {
  return (
    <div className="retro-card mx-auto w-full max-w-3xl p-2 text-left">
      <div className="rounded-[18px] border border-ink/[.06] bg-cream/60 p-5 sm:p-7">
        <div className="flex items-center justify-between text-[13px] text-ink-soft">
          <span>Jessica · Austin, TX · family of 3</span>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-medium text-brand-deep">Sample</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4">
            <div className="text-[13px] text-ink-soft">Insurance / month</div>
            <div className="num mt-2 text-3xl font-semibold text-brand">$734</div>
            <div className="num text-[13px] text-ink-soft line-through">COBRA $2,406</div>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="text-[13px] text-ink-soft">Money lasts</div>
            <div className="num mt-2 text-3xl font-semibold">8.3 mo</div>
            <div className="text-[13px] text-ink-soft">with Marketplace</div>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="text-[13px] text-ink-soft">Next deadline</div>
            <div className="mt-2 text-lg font-semibold leading-tight">File for unemployment</div>
            <div className="text-[13px] text-ink-soft">this week</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const nav = useNavigate()
  const sample = useMutation({
    mutationFn: () => post<{ caseId: string }>('/cases/sample', {}),
    onSuccess: (r) => nav(`/summary/${r.caseId}`),
  })
  return (
    <>
      <section className="glow relative">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:pt-24">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-ink/[.08] bg-white/80 px-3 py-1.5 text-[13px] text-ink-soft">
              <span className="size-1.5 rounded-full bg-brand" /> For US workers who were just laid off
            </div>
            <h1 className="mx-auto mt-6 max-w-4xl text-[44px] font-semibold leading-[1.02] sm:text-[76px]">
              Lose your job,
              <br />
              <span className="text-gradient">not your money.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-soft sm:text-lg">
              You’ll find the next job. We handle the money side of the months in between: health insurance, unemployment, severance, the offer and taxes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/start" className="btn btn-primary w-full sm:w-auto">
                Start my plan <ArrowUpRight className="size-4" />
              </Link>
              <button className="btn btn-sky w-full sm:w-auto" onClick={() => sample.mutate()} disabled={sample.isPending}>
                {sample.isPending ? 'Opening sample…' : 'See a sample case'}
              </button>
            </div>
            {sample.error && <div className="mx-auto mt-4 max-w-md text-left"><ErrorBox error={sample.error} onRetry={() => sample.mutate()} /></div>}
            <p className="mt-4 text-[13px] text-ink-soft">Takes 2 minutes · No login · No bank connection · No SSN</p>
          </motion.div>
          <motion.div className="mt-14" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15, ease }}>
            <Preview />
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-px overflow-hidden rounded-3xl border border-ink/[.07] bg-ink/[.07] sm:grid-cols-3">
          {facts.map(([v, u, s]) => (
            <div key={s} className="bg-cream p-6">
              <div className="num text-4xl font-semibold text-brand">{v}</div>
              <div className="text-sm font-medium">{u}</div>
              <p className="mt-2 text-sm text-ink-soft">{s}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="max-w-2xl">
          <h2 className="text-4xl font-semibold leading-tight sm:text-5xl">
            One event, start to finish.
            <br />
            <span className="text-ink-soft">Six to eight money decisions in 60 days.</span>
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.t}
              className="retro-card-soft p-6"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: i * 0.06, ease }}
            >
              <div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-deep">
                <s.icon className="size-5" />
              </div>
              <div className="mt-5 text-[13px] text-ink-soft">{s.k}</div>
              <h3 className="mt-1 text-lg font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['We calculate, you decide', 'Every number shows its formula, source and date. We never tell you which plan to pick.'],
            ['No commissions', 'We don’t sell insurance. You pay us, so we work for you.'],
            ['Only numbers', 'No SSN, no account numbers, no bank login. Just dates and amounts.'],
          ].map(([t, d]) => (
            <div key={t} className="border-t border-ink/10 pt-5">
              <h4 className="font-semibold">{t}</h4>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-3xl bg-ink p-8 text-white sm:flex-row sm:items-center sm:p-10">
          <div>
            <h3 className="text-3xl font-semibold">Your next 60 days, decoded.</h3>
            <p className="mt-2 text-white/60">Answer 8 short questions. See your numbers right away.</p>
          </div>
          <Link to="/start" className="btn btn-primary">Start my plan <ArrowUpRight className="size-4" /></Link>
        </div>
      </section>
    </>
  )
}
