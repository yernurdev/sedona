import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, post } from '../api/client'
import { useCaseInfo } from '../api/hooks'
import { ErrorBox, Spinner, Tag } from '../components/ui'

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
        <div className="mono-label text-wine">Transition plan</div>
        <h1 className="mt-1 text-4xl font-bold">
          <span className="num">${price.firstMonth}</span> first month
        </h1>
        <p className="mt-1 text-lg text-ink-soft">then <span className="num">${price.thenMonthly}</span>/mo while you search. Cancel anytime.</p>
        <ul className="mt-6 space-y-3">
          {includes.map((i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-wine text-cream"><Check className="size-3" /></span>
              {i}
            </li>
          ))}
        </ul>
        <p className="mt-6 flex items-center gap-2 text-sm text-ink-soft"><ShieldCheck className="size-4" /> We never sell insurance or take commissions. You pay, so we work for you.</p>
      </div>

      <div className="retro-card p-6">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Checkout</div>
          <Tag tone="wine">Test mode · no real charge</Tag>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-ink/40 bg-sky/30 p-4 text-sm">
          <div className="mono-label mb-1">Use the test card</div>
          <div className="num text-lg font-bold">{p.testCard}</div>
          <div className="text-ink-soft">any future date (e.g. 12/30) · any CVC (e.g. 123)</div>
        </div>
        {p.stripeEnabled ? (
          <button className="btn btn-primary mt-5 w-full" onClick={() => stripe.mutate()} disabled={stripe.isPending}>
            <CreditCard className="size-4" /> {stripe.isPending ? 'Opening Stripe…' : `Pay $${price.firstMonth} with Stripe`}
          </button>
        ) : (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              test.mutate()
            }}
          >
            <input className="field num" placeholder="Card number" inputMode="numeric" autoComplete="off" value={card} onChange={(e) => setCard(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className="field num" placeholder="MM/YY" autoComplete="off" value={exp} onChange={(e) => setExp(e.target.value)} />
              <input className="field num" placeholder="CVC" inputMode="numeric" autoComplete="off" value={cvc} onChange={(e) => setCvc(e.target.value)} />
            </div>
            <button className="btn btn-primary w-full" disabled={test.isPending}>
              <CreditCard className="size-4" /> {test.isPending ? 'Processing…' : `Pay $${price.firstMonth} (test)`}
            </button>
            <p className="text-xs text-ink-soft">Built-in test checkout: only the public test card is accepted and nothing is charged.</p>
          </form>
        )}
        {(stripe.error || test.error) && <div className="mt-3"><ErrorBox error={stripe.error ?? test.error} /></div>}
        {info.data?.isSample && (
          <div className="mt-6 border-t border-dashed border-line pt-4">
            <div className="mono-label text-ink-soft">Judges / demo only</div>
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
