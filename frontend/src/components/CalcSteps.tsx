import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Summary } from '../api/types'
import { usd } from '../lib/format'

const STEP_MS = 420

function seenKey(id: string) {
  return `sedona.calc.${id}`
}

export function shouldShowSteps(id: string) {
  try {
    return sessionStorage.getItem(seenKey(id)) !== '1'
  } catch {
    return false
  }
}

// Walks through the real intermediate results the engine returned, so the user sees what was computed.
export default function CalcSteps({ s, onDone }: { s: Summary; onDone: () => void }) {
  const aca = s.insurance.aca
  const steps: [string, string][] = [
    ['Loading 2026 federal and state rules', '7 official sources'],
    [`Projecting your ${aca?.year ?? ''} household income`, aca ? usd(aca.magi) : 'done'],
    ['Checking Marketplace subsidy eligibility', aca ? `${aca.fplPct}% of the poverty line` : 'done'],
    ['Pricing COBRA for your household', `${usd(s.insurance.cobraMonthly)}/mo`],
    ['Pricing the benchmark Marketplace plan', `${usd(s.insurance.acaMonthly)}/mo after tax credit`],
    ['Simulating your cash week by week', `${s.runway.months.toFixed(1)} months`],
    ['Building your deadline calendar', `${s.deadlineCount} deadlines`],
  ]
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n >= steps.length) {
      try {
        sessionStorage.setItem(seenKey(s.caseId), '1')
      } catch {
        /* ignore */
      }
      const t = setTimeout(onDone, 500)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setN((x) => x + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [n, steps.length, onDone, s.caseId])

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:py-24">
      <h1 className="text-3xl font-semibold">Running your numbers</h1>
      <p className="mt-2 text-ink-soft">Every figure is computed from your answers with published rules.</p>
      <ol className="retro-card mt-8 divide-y divide-ink/[.06] p-2">
        {steps.map(([t, v], i) => (
          <li key={t} className="flex items-center gap-3 px-3 py-3">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full ${i < n ? 'bg-brand text-white' : 'bg-ink/[.05] text-ink-soft'}`}>
              {i < n ? <Check className="size-3.5" /> : i === n ? <Loader2 className="size-3.5 animate-spin" /> : null}
            </span>
            <span className={`flex-1 text-sm ${i <= n ? 'text-ink' : 'text-ink-soft/60'}`}>{t}</span>
            {i < n && (
              <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className="num whitespace-nowrap text-right text-sm font-medium text-brand-deep">
                {v}
              </motion.span>
            )}
          </li>
        ))}
      </ol>
      <button className="mt-4 text-[13px] text-ink-soft hover:text-ink" onClick={onDone}>Skip</button>
    </div>
  )
}
