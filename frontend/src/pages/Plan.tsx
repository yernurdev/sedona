import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Copy, ExternalLink, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { API_URL, api, getToken, post } from '../api/client'
import { usePlan } from '../api/hooks'
import type { Plan as PlanT } from '../api/types'
import Explain from '../components/Explain'
import { ErrorBox, Estimate, HowCalc, SectionTitle, Spinner, Src, Tag } from '../components/ui'
import { days, fmtDate, optionName, shortDate, usd } from '../lib/format'

const tabs = ['Insurance', 'Runway', 'Deadlines', 'Unemployment', 'Severance', 'Actions'] as const

function Insurance({ p, caseId }: { p: PlanT; caseId: string }) {
  const aca = p.insurance.options.find((o) => o.type === 'aca')
  return (
    <>
      <SectionTitle kicker="Health insurance" title="Three ways to stay covered">
        Based on your numbers. We show the cost and the deadline; the choice is yours.
      </SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        {p.insurance.options.map((o) => (
          <div key={o.type} className={o.type === p.insurance.cheapest ? 'retro-card p-6 ring-2 ring-brand' : 'retro-card-soft p-6'}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{o.label}</div>
              {o.type === p.insurance.cheapest && <Tag tone="brand">lowest cost</Tag>}
            </div>
            <div className="num mt-3 text-4xl font-bold">{o.monthly == null ? '—' : usd(o.monthly)}<span className="text-base font-normal text-ink-soft">{o.monthly == null ? '' : '/mo'}</span></div>
            {o.annual != null && <div className="num text-sm text-ink-soft">{usd(o.annual)} per year</div>}
            {o.estimate && <div className="mt-2"><Estimate /></div>}
            {o.enrollBy && <div className="mt-3 text-sm"><b>Enroll by:</b> {fmtDate(o.enrollBy)}</div>}
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {o.notes.map((n) => <li key={n}>• {n}</li>)}
            </ul>
            {o.source && <div className="mt-3 text-xs"><Src href={o.source} /></div>}
          </div>
        ))}
      </div>
      <div className="retro-card-soft mt-5 p-5">
        <div className="text-[13px] font-medium text-brand-deep">Insider move</div>
        <p className="mt-1">COBRA can be elected retroactively. If nothing happens during your election window, you may never pay for it; if something does, elect and pay back to the day your coverage ended. Many people use this window while their Marketplace plan starts.</p>
      </div>
      {aca?.quotes && (
        <div className="retro-card-soft mt-5 p-5">
          <div className="font-semibold">Marketplace math by calendar year</div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="mono-label text-left text-ink-soft">
                <tr><th className="py-2">Year</th><th>Projected income</th><th>% of poverty line</th><th>Benchmark</th><th>Tax credit</th><th>You pay</th></tr>
              </thead>
              <tbody className="num">
                {aca.quotes.map((q) => (
                  <tr key={q.year} className="border-t border-ink/[.06]">
                    <td className="py-2">{q.year}</td><td>{usd(q.magi)}</td><td>{q.fplPct}%</td><td>{usd(q.benchmarkMonthly)}</td><td>{usd(q.subsidyMonthly)}</td><td className="font-bold">{usd(q.netMonthly)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <HowCalc>
            {aca.quotes.map((q) => (
              <p key={q.year}>
                <b>{q.year}:</b> income = wages {usd(q.magiBreakdown.wages)} + severance {usd(q.magiBreakdown.severance)} + unemployment {usd(q.magiBreakdown.unemployment)} + new job {usd(q.magiBreakdown.newJob)} + spouse {usd(q.magiBreakdown.spouse)}. Poverty line ({q.fplYear} guidelines) {usd(q.fpl)}. {q.statusNote}
              </p>
            ))}
            <p>Benchmark = state average second-lowest silver premium for a 40-year-old (KFF), scaled by the federal age curve for each person. Exact plans and prices: <Src href="https://www.healthcare.gov/see-plans/">healthcare.gov</Src>.</p>
          </HowCalc>
          <Explain caseId={caseId} topic="aca_subsidy" />
        </div>
      )}
    </>
  )
}

function Runway({ p, caseId }: { p: PlanT; caseId: string }) {
  const [opt, setOpt] = useState(p.runway.basis)
  const r = p.runway.byOption[opt]
  const data = (r.weeks ?? []).map((w) => ({ week: w.week, cash: w.cash }))
  return (
    <>
      <SectionTitle kicker="Runway" title={`${p.runway.months.toFixed(1)} months of cash`}>Week by week, assuming no new job. Switch the insurance option to see the difference.</SectionTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.keys(p.runway.byOption).map((k) => (
          <button key={k} onClick={() => setOpt(k)} className={`rounded-full border px-4 py-1.5 text-sm ${opt === k ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white'}`}>
            {optionName[k]} · <span className="num">{p.runway.byOption[k].months.toFixed(1)} mo</span>
          </button>
        ))}
      </div>
      <div className="retro-card-soft p-4">
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ left: 8, right: 8, top: 10 }}>
              <defs>
                <linearGradient id="cash" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#4E9AFF" stopOpacity={0.35} />
                  <stop offset="1" stopColor="#B8D1FC" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E7D5CB" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="week" tickFormatter={shortDate} tick={{ fontSize: 11, fontFamily: 'Geist' }} minTickGap={40} />
              <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fontFamily: 'Geist' }} width={48} />
              <Tooltip formatter={(v) => usd(Number(v))} labelFormatter={(l) => `Week of ${fmtDate(String(l))}`} />
              <ReferenceLine y={0} stroke="#1E1517" />
              <ReferenceLine x={data.find((d) => d.week >= p.currentDate)?.week} stroke="#2F80EC" strokeDasharray="4 4" label={{ value: "today", fontSize: 11, fill: "#2F80EC" }} />
              <Area type="monotone" dataKey="cash" stroke="#4E9AFF" strokeWidth={2} fill="url(#cash)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-sm text-ink-soft">
          {r.beyondHorizon ? 'Cash stays positive for the next 3 years.' : <>Cash runs out the week of <b>{fmtDate(r.endsOn!)}</b>.</>} Insurance: {usd(r.insuranceMonthly)}/mo.
        </div>
        <HowCalc>
          <p>Start: your savings. Severance is added (after 22% federal, 7.65% FICA and state withholding) the week it is paid. Estimated unemployment benefits are added each paid week (after the waiting week, up to your state’s maximum weeks). Each week we subtract (monthly expenses + insurance) × 12 ÷ 52. Earnings you log in weekly check-ins are added.</p>
        </HowCalc>
        <Explain caseId={caseId} topic="runway" />
      </div>
    </>
  )
}

function Deadlines({ p, caseId }: { p: PlanT; caseId: string }) {
  const icsUrl = `${API_URL}/cases/${caseId}/calendar.ics?token=${encodeURIComponent(getToken() ?? '')}`
  return (
    <>
      <SectionTitle kicker="Deadlines" title="Every date that costs money if missed">Computed from your last day, coverage end date and state.</SectionTitle>
      <div className="mb-5 flex flex-wrap gap-2">
        <a className="btn btn-primary btn-sm" href={icsUrl}><CalendarPlus className="size-4" /> Add to calendar (.ics)</a>
        <span className="self-center text-xs text-ink-soft">Includes a recurring reminder for your weekly unemployment request. Import into Google Calendar via Settings → Import.</span>
      </div>
      <ol className="relative space-y-3 border-l border-ink/10 pl-6">
        {p.deadlines.map((d) => (
          <li key={d.id} className={`relative ${d.passed ? 'opacity-50' : ''}`}>
            <span className={`absolute -left-[31px] top-5 size-3 rounded-full ring-4 ring-cream ${d.severity === 'high' ? 'bg-wine' : d.severity === 'medium' ? 'bg-brand' : 'bg-ink/20'}`} />
            <div className="retro-card-soft p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-semibold">{d.title}</div>
                <div className="num text-sm">{fmtDate(d.date)} · <span className={d.severity === 'high' ? 'font-bold text-wine' : ''}>{d.passed ? 'passed' : days(d.daysLeft)}</span></div>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{d.detail} <Src href={d.source} /></p>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

function Unemployment({ p }: { p: PlanT }) {
  const u = p.unemployment
  return (
    <>
      <SectionTitle kicker="Unemployment" title={`About ${usd(u.weeklyBenefit)} a week`}>Estimate. Your state determines the final amount.</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Weekly benefit', usd(u.weeklyBenefit)],
          ['Max weeks', String(u.maxWeeks)],
          ['Total potential', usd(u.totalPotential)],
        ].map(([k, v]) => (
          <div key={k} className="retro-card-soft p-5">
            <div className="mono-label text-ink-soft">{k}</div>
            <div className="num mt-2 text-3xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="retro-card-soft mt-4 p-5">
        <div className="font-semibold">How to file</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{u.howToFile.map((h) => <li key={h}>{h}</li>)}</ol>
        <div className="mt-3 text-sm"><b>Work search:</b> {u.workSearchRule}</div>
        <div className="text-sm"><b>Certification:</b> {u.certification}{u.waitingWeek ? ' · the first week is an unpaid waiting week' : ''}</div>
        <a className="btn btn-sky btn-sm mt-4" href={u.portalUrl} target="_blank" rel="noreferrer">Open state portal <ExternalLink className="size-4" /></a>
        <HowCalc><p>{u.formula} <Src href={u.source}>State source</Src></p></HowCalc>
      </div>
    </>
  )
}

const asks = [
  ['extend_severance', 'One more month of severance'],
  ['cobra_subsidy', 'Company-paid COBRA'],
  ['keep_bonus', 'Earned bonus payout'],
  ['extend_deadline', 'More time to review'],
  ['pto_payout', 'Unused PTO payout'],
] as const

function Severance({ p, caseId }: { p: PlanT; caseId: string }) {
  const s = p.severance
  const [tone, setTone] = useState<'polite' | 'firm'>('polite')
  const [sel, setSel] = useState<string[]>(['extend_severance', 'cobra_subsidy'])
  const [copied, setCopied] = useState(false)
  const letter = useMutation({ mutationFn: () => post<{ subject: string; body: string }>(`/cases/${caseId}/hr-letter`, { tone, asks: sel }) })
  return (
    <>
      <SectionTitle kicker="Severance" title={`${usd(s.netEstimate)} after withholding`}>{s.note}</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="retro-card-soft p-5">
          <dl className="num space-y-1 text-sm">
            {[['Gross', s.gross], ['Federal (22% supplemental)', -s.federalWithheld], ['FICA (7.65%)', -s.fica], ['State', -s.stateWithheld]].map(([k, v]) => (
              <div key={k as string} className="flex justify-between border-b border-ink/[.06] py-1.5"><dt className="font-sans text-ink-soft">{k}</dt><dd>{usd(v as number)}</dd></div>
            ))}
            <div className="flex justify-between py-1.5 font-bold"><dt className="font-sans">Net estimate</dt><dd>{usd(s.netEstimate)}</dd></div>
          </dl>
          {s.signBy && <p className="mt-3 text-sm"><b>Decide by:</b> {fmtDate(s.signBy)}. Don’t sign on day one.</p>}
          <div className="mt-4 font-semibold">Questions to ask HR before signing</div>
          <ul className="mt-2 space-y-1.5 text-sm">{s.questionsForHR.map((q) => <li key={q}>☐ {q}</li>)}</ul>
        </div>
        <div className="retro-card p-5">
          <div className="flex items-center gap-2 font-semibold"><Mail className="size-4" /> Draft an email to HR</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {asks.map(([id, label]) => (
              <button key={id} onClick={() => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))}
                className={`rounded-full border px-3 py-1 text-sm ${sel.includes(id) ? 'border-brand bg-brand-soft text-brand-deep' : 'border-ink/10 bg-white'}`}>{label}</button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {(['polite', 'firm'] as const).map((t) => (
              <button key={t} onClick={() => setTone(t)} className={`mono-label rounded-full border px-3 py-1 ${tone === t ? 'border-ink bg-ink text-white' : 'border-ink/10'}`}>{t}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm mt-4" onClick={() => letter.mutate()} disabled={letter.isPending || sel.length === 0}>
            {letter.isPending ? 'Writing…' : letter.data ? 'Rewrite' : 'Write the email'}
          </button>
          {letter.error && <div className="mt-3"><ErrorBox error={letter.error} onRetry={() => letter.mutate()} /></div>}
          {letter.data && (
            <div className="mt-4 rounded-2xl bg-cream p-4 text-sm">
              <div className="font-semibold">Subject: {letter.data.subject}</div>
              <p className="mt-2 whitespace-pre-line">{letter.data.body}</p>
              <button className="btn btn-ghost btn-sm mt-3" onClick={() => { navigator.clipboard.writeText(`Subject: ${letter.data!.subject}\n\n${letter.data!.body}`); setCopied(true) }}>
                <Copy className="size-4" /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-soft">AI drafts the wording from your numbers. We don’t review agreement terms; for that, talk to an employment attorney.</p>
        </div>
      </div>
    </>
  )
}

function Actions({ p, caseId }: { p: PlanT; caseId: string }) {
  const cols = [['Today', p.actions.today], ['This week', p.actions.thisWeek], ['This month', p.actions.thisMonth]] as const
  return (
    <>
      <SectionTitle kicker="Action plan" title="What to do, in order" />
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map(([t, items]) => (
          <div key={t} className="retro-card-soft p-5">
            <div className="text-[13px] font-medium text-brand-deep">{t}</div>
            <ul className="mt-3 space-y-2 text-sm">{items.length ? items.map((i) => <li key={i}>☐ {i}</li>) : <li className="text-ink-soft">Nothing due.</li>}</ul>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={`/checkin/${caseId}`} className="btn btn-primary">Do this week’s check-in</Link>
        <Link to={`/offer/${caseId}`} className="btn btn-sky">Got an offer?</Link>
      </div>
    </>
  )
}

function PaymentPending({ caseId }: { caseId: string }) {
  const qc = useQueryClient()
  const st = useQuery({
    queryKey: ['billing', caseId],
    queryFn: () => api<{ paid: boolean }>(`/billing/status/${caseId}`),
    refetchInterval: (q) => (q.state.data?.paid ? false : 2000),
  })
  useEffect(() => {
    if (st.data?.paid) qc.invalidateQueries({ queryKey: ['plan', caseId] })
  }, [st.data?.paid, qc, caseId])
  return <Spinner label="Confirming payment" />
}

export default function Plan() {
  const { caseId = '' } = useParams()
  const [params] = useSearchParams()
  const q = usePlan(caseId)
  const [tab, setTab] = useState<(typeof tabs)[number]>('Insurance')
  if (q.isLoading) return <Spinner />
  if (q.error) {
    const status = (q.error as { status?: number }).status
    if (status === 402 && params.get('paid')) return <PaymentPending caseId={caseId} />
    if (status === 402)
      return (
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">This plan is locked</h1>
          <Link to={`/pay/${caseId}`} className="btn btn-primary mt-4">Unlock for $39</Link>
        </div>
      )
    return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
  }
  const p = q.data!
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex gap-1 overflow-x-auto rounded-full border border-ink/[.07] bg-white p-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-brand text-white' : 'hover:bg-cream-deep'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Insurance' && <Insurance p={p} caseId={caseId} />}
      {tab === 'Runway' && <Runway p={p} caseId={caseId} />}
      {tab === 'Deadlines' && <Deadlines p={p} caseId={caseId} />}
      {tab === 'Unemployment' && <Unemployment p={p} />}
      {tab === 'Severance' && <Severance p={p} caseId={caseId} />}
      {tab === 'Actions' && <Actions p={p} caseId={caseId} />}
    </div>
  )
}
