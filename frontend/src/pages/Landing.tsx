import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarCheck, HeartPulse, LineChart, Receipt } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { post } from '../api/client'
import { ErrorBox } from '../components/ui'

function Sun() {
  return (
    <svg viewBox="0 0 200 100" className="w-full" aria-hidden>
      <defs>
        <linearGradient id="sunfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2F80EC" />
          <stop offset="1" stopColor="#9CC7FF" />
        </linearGradient>
        <clipPath id="half">
          <rect x="0" y="0" width="200" height="100" />
        </clipPath>
      </defs>
      <g clipPath="url(#half)">
        <circle cx="100" cy="100" r="96" fill="url(#sunfill)" />
        {[54, 66, 76, 85, 93].map((y, i) => (
          <rect key={y} x="0" y={y} width="200" height={2 + i * 1.2} fill="#FCF3EE" />
        ))}
      </g>
    </svg>
  )
}

const steps = [
  { icon: HeartPulse, k: 'Day 0', t: 'Insurance decoded', d: 'COBRA vs Marketplace vs your spouse’s plan, priced on your new annual income.' },
  { icon: CalendarCheck, k: 'Every week', t: 'Never miss a benefit check', d: 'Log job-search activities in 10 seconds and get a ready-to-paste record for your state.' },
  { icon: LineChart, k: 'The offer', t: 'Exit without a surprise', d: 'Compare offers net of benefits, bridge coverage gaps, avoid the subsidy clawback.' },
  { icon: Receipt, k: 'Tax day', t: 'Know before April', d: 'Tax on unemployment and severance, plus the full ACA reconciliation preview.' },
]

export default function Landing() {
  const nav = useNavigate()
  const sample = useMutation({
    mutationFn: () => post<{ caseId: string }>('/cases/sample', {}),
    onSuccess: (r) => nav(`/summary/${r.caseId}`),
  })
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="horizon" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-12 md:grid-cols-[1.15fr_.85fr] md:pt-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className="mono-label inline-flex items-center gap-2 rounded-full border border-ink bg-white px-3 py-1.5">
              <span className="size-2 rounded-full bg-brand" /> For US workers who just got laid off
            </div>
            <h1 className="mt-6 text-[2.6rem] font-bold leading-[1.02] sm:text-6xl">
              Got laid off?
              <br />
              <span className="text-brand">Your next 60 days,</span>
              <br />
              decoded.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-ink-soft">
              You’ll find the next job. We make sure you don’t lose money while you look: health insurance, unemployment, severance, the offer, and taxes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/start" className="btn btn-primary">
                Start — 2 minutes <ArrowRight className="size-4" />
              </Link>
              <button className="btn btn-sky" onClick={() => sample.mutate()} disabled={sample.isPending}>
                {sample.isPending ? 'Loading sample…' : 'Try sample case: Jessica, 38, Austin'}
              </button>
            </div>
            {sample.error && <div className="mt-4 max-w-md"><ErrorBox error={sample.error} onRetry={() => sample.mutate()} /></div>}
            <p className="mono-label mt-5 text-ink-soft">No login · No bank connection · No SSN</p>
          </motion.div>

          <motion.div
            className="retro-card scan relative self-center overflow-hidden p-6"
            initial={{ opacity: 0, y: 16, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="mono-label flex items-center justify-between text-ink-soft">
              <span>Sedona readout</span>
              <span className="text-brand">● live math</span>
            </div>
            <div className="mx-auto mt-4 w-48"><Sun /></div>
            <dl className="mt-4 space-y-3">
              {[
                ['COBRA for a family', '$2,406/mo', 'KFF 2026 avg × 102%'],
                ['Subsidy cliff', '400% FPL', 'Returned in 2026'],
                ['Subsidy repayment cap', 'None', 'From tax year 2026'],
              ].map(([k, v, s]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-line pb-2">
                  <dt className="text-sm text-ink-soft">
                    {k}
                    <div className="mono-label !text-[9px]">{s}</div>
                  </dt>
                  <dd className="num text-xl font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mono-label text-brand">One event, start to finish</div>
        <h2 className="mt-1 max-w-2xl text-3xl font-semibold">6–8 money decisions in 60 days. In panic. With no one on your side.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.t}
              className="retro-card-soft p-5"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
            >
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-full border border-ink bg-sky">
                  <s.icon className="size-5" />
                </span>
                <span className="mono-label text-ink-soft">{String(i + 1).padStart(2, '0')} · {s.k}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-soft">{s.d}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ['We calculate, we don’t advise', 'Every number shows its formula, source and date. You decide.'],
            ['We don’t sell insurance', 'No broker commissions. We link to healthcare.gov and your state portal.'],
            ['Only numbers, no bank login', 'No SSN, no account numbers. Your answers stay in this browser session.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-dashed border-ink/30 p-5">
              <div className="stripes mb-3 h-2 w-12 rounded-full" />
              <h4 className="font-semibold">{t}</h4>
              <p className="mt-1 text-sm text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
