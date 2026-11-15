import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { del, post } from '../api/client'
import { useCaseInfo, useOffers, usePlan } from '../api/hooks'
import type { OfferInput, OfferResult } from '../api/types'
import Explain from '../components/Explain'
import { ErrorBox, HowCalc, SectionTitle, Spinner, Src, Tag } from '../components/ui'
import { addDaysISO, fmtDate, usd } from '../lib/format'

function ResultCard({ r, onDelete }: { r: OfferResult; onDelete?: () => void }) {
  const b = r.breakdown
  const cb = r.aptcClawback
  return (
    <div className="space-y-4">
      <div className="retro-card p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="mono-label text-ink-soft">{r.company || 'Offer'} · worth per year after benefits</div>
            <div className="num mt-1 text-4xl font-bold">{usd(r.effectiveAnnual)}</div>
          </div>
          {onDelete && <button className="btn btn-ghost btn-sm" onClick={onDelete} aria-label="Remove offer"><Trash2 className="size-4" /></button>}
        </div>
        <dl className="num mt-3 space-y-1 text-sm">
          {[['Salary', b.salary], ['Bonus', b.bonus], ['401(k) match', b.match401k], ['Health premiums', -b.premiums], ['Expected out-of-pocket', -b.expectedOutOfPocket]].map(([k, v]) => (
            <div key={k as string} className="flex justify-between border-b border-ink/[.06] py-1"><dt className="font-sans text-ink-soft">{k}</dt><dd>{usd(v as number)}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-soft">{r.assumptions.join(' ')}</p>
      </div>
      <div className="retro-card-soft p-5">
        <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> Coverage bridge</div>
        <p className="mt-2 text-sm">New coverage starts <b>{fmtDate(r.coverageGap.newCoverageStart)}</b>{r.coverageGap.days > 0 && <> · gap of <b>{r.coverageGap.days} days</b></>}.</p>
        <p className="mt-1 text-sm text-ink-soft">{r.coverageGap.bridgeAdvice}</p>
      </div>
      {cb && (
        <div className={`rounded-[16px] border p-6 ${cb.excess > 0 ? 'border-wine/25 bg-wine/[.04]' : 'border-ok/25 bg-ok/[.05]'}`}>
          <div className="flex items-center gap-2 font-semibold">
            {cb.excess > 0 ? <AlertTriangle className="size-5 text-wine" /> : <ShieldCheck className="size-5 text-ok" />}
            {cb.excess > 0 ? <>You could owe <span className="num text-wine">{usd(cb.excess)}</span> in April</> : 'No subsidy clawback expected'}
          </div>
          <p className="mt-2 text-sm">{cb.explanation}</p>
          {cb.excess > 0 && <div className="mt-3"><Tag tone="wine">report by {fmtDate(cb.reportBy)}</Tag></div>}
          <HowCalc>
            <p>{cb.year}: advance credit received {usd(cb.aptcReceived)} over {cb.monthsOnAca} months on the Marketplace. With this offer, projected income {usd(cb.newMagi)} = {cb.fplPct}% of the poverty line, which allows {usd(cb.allowedPtc)}. Excess = received − allowed. Since tax year 2026 the excess is repaid in full. <Src href={cb.source}>IRS</Src></p>
          </HowCalc>
        </div>
      )}
    </div>
  )
}

export default function Offer() {
  const { caseId = '' } = useParams()
  const qc = useQueryClient()
  const info = useCaseInfo(caseId)
  const plan = usePlan(caseId)
  const offers = useOffers(caseId)
  const [f, setF] = useState<OfferInput | null>(null)
  const [last, setLast] = useState<{ result: OfferResult; compareTo: { company: string; difference: number } | null } | null>(null)

  useEffect(() => {
    if (f || !info.data || !plan.data) return
    const aca = plan.data.insurance.options.find((o) => o.type === 'aca')
    const start = addDaysISO(info.data.currentDate, info.data.isSample ? 98 : 30)
    const covEnd = info.data.input.coverageEndDate
    setF({
      company: info.data.isSample ? 'Globex' : '',
      salary: info.data.isSample ? 130000 : info.data.input.annualSalary,
      bonus: 0, match401kPct: 4, employeePremiumMonthly: info.data.isSample ? 250 : 200, deductible: 2000,
      startDate: start, coverageStartsAfterDays: 30,
      currentCoverage: { type: 'aca', monthlyAptc: aca?.enrollmentAptcMonthly ?? 0, aptcStartMonth: addDaysISO(covEnd, 1).slice(0, 7) },
    })
  }, [f, info.data, plan.data])

  const submit = useMutation({
    mutationFn: (body: OfferInput) => post<{ result: OfferResult; compareTo: { company: string; difference: number } | null }>(`/cases/${caseId}/offers`, body),
    onSuccess: (r) => { setLast(r); qc.invalidateQueries({ queryKey: ['offers', caseId] }); qc.invalidateQueries({ queryKey: ['tax', caseId] }) },
  })
  const remove = useMutation({ mutationFn: (id: string) => del(`/cases/${caseId}/offers/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['offers', caseId] }) })

  if (info.isLoading || plan.isLoading || !f) {
    if (plan.error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox error={plan.error} /></div>
    return <Spinner />
  }
  const set = <K extends keyof OfferInput>(k: K, v: OfferInput[K]) => setF({ ...f, [k]: v })
  const n = (k: keyof OfferInput, label: string, hint?: string) => (
    <label className="block text-sm">
      {label}
      {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      <input className="field num mt-1" inputMode="decimal" value={String(f[k])} onChange={(e) => set(k, (Number(e.target.value) || 0) as never)} />
    </label>
  )
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <SectionTitle kicker="Got an offer?" title="Don’t trip on the way out">A bigger salary can be worth less after benefits, and a new job can trigger a subsidy repayment.</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <form className="retro-card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); submit.mutate(f) }}>
          <label className="block text-sm">Company<input className="field mt-1" value={f.company} onChange={(e) => set('company', e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            {n('salary', 'Base salary ($/yr)')}
            {n('bonus', 'Bonus ($/yr)')}
            {n('match401kPct', '401(k) match (%)')}
            {n('employeePremiumMonthly', 'Your health premium ($/mo)')}
            {n('deductible', 'Deductible ($)')}
            {n('coverageStartsAfterDays', 'Coverage starts after (days)')}
          </div>
          <label className="block text-sm">Start date<input type="date" className="field mt-1" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          <div className="rounded-[12px] bg-cream p-3">
            <div className="mono-label text-ink-soft">Your coverage right now</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['aca', 'cobra', 'spouse', 'none'] as const).map((t) => (
                <button type="button" key={t} onClick={() => set('currentCoverage', { ...f.currentCoverage, type: t })}
                  className={`rounded-[10px] border px-3 py-1 text-sm ${f.currentCoverage.type === t ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white'}`}>
                  {t === 'aca' ? 'Marketplace' : t === 'none' ? 'Uninsured' : t === 'cobra' ? 'COBRA' : 'Spouse plan'}
                </button>
              ))}
            </div>
            {f.currentCoverage.type === 'aca' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm">Advance tax credit ($/mo)<span className="block text-xs text-ink-soft">From healthcare.gov</span>
                  <input className="field num mt-1" inputMode="decimal" value={f.currentCoverage.monthlyAptc} onChange={(e) => set('currentCoverage', { ...f.currentCoverage, monthlyAptc: Number(e.target.value) || 0 })} /></label>
                <label className="text-sm">Since month<span className="block text-xs text-ink-soft">&nbsp;</span>
                  <input type="month" className="field mt-1" value={f.currentCoverage.aptcStartMonth} onChange={(e) => set('currentCoverage', { ...f.currentCoverage, aptcStartMonth: e.target.value })} /></label>
              </div>
            )}
          </div>
          <button className="btn btn-primary w-full" disabled={submit.isPending}>{submit.isPending ? 'Calculating…' : 'Compare this offer'}</button>
          {submit.error && <ErrorBox error={submit.error} />}
          {info.data?.isSample && <p className="text-xs text-ink-soft">Sample offer prefilled. Change the salary or start date and watch the clawback move.</p>}
        </form>
        <div>
          {last ? (
            <>
              {last.compareTo && (
                <div className="mb-4 rounded-[12px] bg-brand-soft p-4 text-sm">
                  vs <b>{last.compareTo.company || 'previous offer'}</b>: this one is worth <b className="num">{usd(Math.abs(last.compareTo.difference))}</b> {last.compareTo.difference >= 0 ? 'more' : 'less'} per year after benefits.
                </div>
              )}
              <ResultCard r={last.result} />
              {last.result.aptcClawback && <Explain caseId={caseId} topic="clawback" />}
            </>
          ) : (
            <div className="rounded-[12px] border border-ink/[.08] bg-white/50 p-6 text-sm text-ink-soft">Enter an offer to see its real value, the coverage bridge and any subsidy clawback.</div>
          )}
        </div>
      </div>
      {offers.data && offers.data.offers.length > 0 && (
        <section className="mt-10">
          <h3 className="text-xl font-semibold">Saved offers</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {offers.data.offers.map((o) => (
              <div key={o.id} className="retro-card-soft p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{o.input.company || 'Offer'}</div>
                  <button className="text-ink-soft hover:text-brand" onClick={() => remove.mutate(o.id)} aria-label="Remove"><Trash2 className="size-4" /></button>
                </div>
                <div className="num mt-2 text-2xl font-bold">{usd(o.result.effectiveAnnual)}</div>
                <div className="text-xs text-ink-soft">base {usd(o.input.salary)} · starts {fmtDate(o.input.startDate)}</div>
                {o.result.aptcClawback && o.result.aptcClawback.excess > 0 && <div className="mt-2"><Tag tone="wine">clawback risk {usd(o.result.aptcClawback.excess)}</Tag></div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
