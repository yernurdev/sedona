import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTax } from '../api/hooks'
import { ErrorBox, SectionTitle, Spinner, Src, Tag } from '../components/ui'
import { fmtDate, usd } from '../lib/format'

export default function Tax() {
  const { caseId = '' } = useParams()
  const [wh, setWh] = useState(false)
  const q = useTax(caseId, wh)
  if (q.isLoading) return <Spinner />
  if (q.error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>
  const t = q.data!
  const rows: [string, number, string][] = [
    ['Unemployment benefits (taxable)', t.unemploymentTaxable, `${usd(t.unemploymentWithheld)} withheld`],
    ['Estimated tax still owed on unemployment', t.unemploymentEstimatedOwed, `at your ${t.marginalRatePct}% bracket`],
    ['Severance withheld at 22%', t.severanceWithheld, `of ${usd(t.severanceGross)} gross`],
    ['Extra owed on severance', t.severanceExtraOwed, t.severanceExtraOwed === 0 ? 'withholding likely covers it' : 'your bracket is above 22%'],
  ]
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <SectionTitle kicker={`Tax preview · ${t.year}`} title="Know what you’ll owe before April">
        Filing {t.filingStatus === 'married' ? 'jointly' : 'single'} · projected income {usd(t.projectedIncome)} · taxable after standard deduction {usd(t.taxableIncome)}.
      </SectionTitle>
      <label className="mb-5 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={wh} onChange={(e) => setWh(e.target.checked)} className="size-4 accent-[var(--color-wine)]" />
        I asked my state to withhold 10% from unemployment (Form W-4V)
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map(([k, v, s]) => (
          <div key={k} className="retro-card-soft p-5">
            <div className="mono-label text-ink-soft">{k}</div>
            <div className="num mt-2 text-3xl font-bold">{usd(v)}</div>
            <div className="text-sm text-ink-soft">{s}</div>
          </div>
        ))}
      </div>
      <div className={`mt-5 rounded-[22px] border-2 p-5 ${t.aptc && t.aptc.excess > 0 ? 'border-wine bg-wine/5' : 'border-line bg-white/70'}`}>
        <div className="font-semibold">Marketplace subsidy reconciliation</div>
        {t.aptc ? (
          <>
            <div className="num mt-2 text-3xl font-bold text-wine">{usd(t.aptc.excess)}</div>
            <p className="text-sm">Projected repayment for {t.aptc.year} based on your saved offer. Report income by {fmtDate(t.aptc.reportBy)} to shrink it.</p>
            <div className="mt-2"><Tag tone="wine">no repayment cap since 2026</Tag></div>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Add an offer in <Link className="text-wine underline" to={`/offer/${caseId}`}>Got an offer?</Link> to project your Form 8962 reconciliation.</p>
        )}
      </div>
      <ul className="mt-5 space-y-1 text-sm text-ink-soft">{t.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
      <p className="mt-2 text-xs"><Src href={t.source}>IRS 2026 brackets</Src></p>
    </div>
  )
}
