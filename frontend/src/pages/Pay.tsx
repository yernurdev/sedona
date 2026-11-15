import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, post } from '../api/client'
import { useCaseInfo } from '../api/hooks'
import { ErrorBox, Spinner, Tag } from '../components/ui'

const fmtCard = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
const fmtExp = (v: string, prev: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (d.length === 0) return ''
  if (d.length === 1) return Number(d) > 1 ? `0${d} / ` : d
  if (d.length === 2 && v.length < prev.length) return d
  return `${d.slice(0, 2)} / ${d.slice(2)}`
}

type Plans = { plans: { firstMonth: number; thenMonthly: number }[]; testCard: string; stripeEnabled: boolean }

const includes = [
  'COBRA vs Marketplace vs spouse plan, side by side',
  'Every deadline, exported to your calendar',
  'Weekly check-in: work search record for your state portal',
  'Severance questions + HR letter draft',
  '“Got an offer?” comparison and subsidy clawback check',
  'Tax-day preview',
]

export default function Pay() {
  const { caseId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const info = useCaseInfo(caseId)
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<Plans>('/billing/plans') })
  const [card, setCard] = useState('')
  const [exp, setExp] = useState('')
  const [cvc, setCvc] = useState('')
  const stripe = useMutation({
    mutationFn: () => post<{ url: string }>('/billing/checkout', { caseId }),
    onSuccess: (r) => window.location.assign(r.url),
  })
  const test = useMutation({
    mutationFn: () => post('/billing/test-checkout', { caseId, card, expiry: exp, cvc }),
    onSuccess: async () => {
      await qc.invalidateQueries()
      nav(`/plan/${caseId}?paid=1`)
    },
  })
  const unlock = useMutation({
    mutationFn: () => post(`/cases/${caseId}/demo/unlock`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries()
      nav(`/plan/${caseId}`)
    },
  })
  if (plans.isLoading || info.isLoading) return <Spinner label="Loading" />
  if (plans.error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox error={plans.error} onRetry={() => plans.refetch()} /></div>
  const p = plans.data!
  const price = p.plans[0]
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2">
      <div>
        <div className="text-[13px] font-medium text-brand-deep">Transition plan</div>
        <h1 className="mt-2 text-5xl font-semibold">
          <span className="num">${price.firstMonth}</span> first month
        </h1>
        <p className="mt-1 text-lg text-ink-soft">then <span className="num">${price.thenMonthly}</span>/mo while you search. Cancel anytime.</p>
        <ul className="mt-6 space-y-3">
          {includes.map((i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep"><Check className="size-3" /></span>
              {i}
            </li>
          ))}
        </ul>
        <p className="mt-6 flex items-center gap-2 text-sm text-ink-soft"><ShieldCheck className="size-4" /> We never sell insurance or take commissions. You pay, so we work for you.</p>
      </div>

      <div className="retro-card p-6">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Checkout</div>
          <Tag tone="brand">Test mode · no real charge</Tag>
        </div>
        <div className="mt-4 rounded-2xl bg-brand-soft p-4 text-sm">
          <div className="mb-1 text-[13px] font-medium text-brand-deep">Use the test card</div>
          <div className="num text-lg font-bold">{p.testCard}</div>
          <div className="text-ink-soft">Any future date · any 3-digit CVC</div>
          {!p.stripeEnabled && (
            <button type="button" className="mt-2 text-[13px] font-medium text-brand-deep hover:text-brand" onClick={() => { setCard('4242 4242 4242 4242'); setExp('12 / 30'); setCvc('123') }}>
              Fill test card
            </button>
          )}
        </div>
        {p.stripeEnabled ? (
          <button className="btn btn-primary mt-5 w-full" onClick={() => stripe.mutate()} disabled={stripe.isPending}>
            <CreditCard className="size-4" /> {stripe.isPending ? 'Opening Stripe…' : `Pay $${price.firstMonth} with Stripe`}
          </button>
        ) : (
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault()
              test.mutate()
            }}
          >
            <label className="text-sm font-medium" htmlFor="cc">Card information</label>
            <div className="mt-1.5 overflow-hidden rounded-[14px] border border-ink/[.12] bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/20">
              <div className="flex items-center gap-2 border-b border-ink/[.08] px-3.5">
                <input id="cc" className="num w-full py-3 text-base outline-none placeholder:text-[#A7A3A0]" placeholder="1234 1234 1234 1234" inputMode="numeric" autoComplete="cc-number"
                  value={card} onChange={(e) => setCard(fmtCard(e.target.value))} />
                <CreditCard className="size-5 shrink-0 text-ink-soft" />
              </div>
              <div className="grid grid-cols-2 divide-x divide-ink/[.08]">
                <input className="num px-3.5 py-3 text-base outline-none placeholder:text-[#A7A3A0]" placeholder="MM / YY" inputMode="numeric" autoComplete="cc-exp" aria-label="Expiry"
                  value={exp} onChange={(e) => setExp(fmtExp(e.target.value, exp))} />
                <input className="num px-3.5 py-3 text-base outline-none placeholder:text-[#A7A3A0]" placeholder="CVC" inputMode="numeric" autoComplete="cc-csc" aria-label="CVC"
                  value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
            </div>
            <button className="btn btn-primary mt-4 w-full" disabled={test.isPending || card.replace(/\s/g, '').length < 16 || exp.length < 7 || cvc.length < 3}>
              {test.isPending ? 'Processing…' : `Pay $${price.firstMonth}`}
            </button>
            <p className="mt-3 text-center text-[12px] text-ink-soft">Test mode: only the public test card is accepted and nothing is charged.</p>
          </form>
        )}
        {(stripe.error || test.error) && <div className="mt-3"><ErrorBox error={stripe.error ?? test.error} /></div>}
        {info.data?.isSample && (
          <div className="mt-6 border-t border-ink/[.06] pt-4">
            <div className="text-[13px] text-ink-soft">For judges: demo shortcut</div>
            <button className="btn btn-sky btn-sm mt-2" onClick={() => unlock.mutate()} disabled={unlock.isPending}>
              Unlock sample case without paying
            </button>
            {unlock.error && <div className="mt-2"><ErrorBox error={unlock.error} /></div>}
          </div>
        )}
      </div>
    </div>
  )
}
