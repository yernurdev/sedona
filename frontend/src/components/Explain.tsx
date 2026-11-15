import { useMutation } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { post } from '../api/client'
import { ErrorBox } from './ui'

export default function Explain({ caseId, topic, label = 'Explain in plain English' }: { caseId: string; topic: 'aca_subsidy' | 'cobra' | 'runway' | 'clawback'; label?: string }) {
  const m = useMutation({ mutationFn: () => post<{ text: string }>(`/cases/${caseId}/explain`, { topic }) })
  return (
    <div className="mt-3">
      {!m.data && (
        <button className="btn btn-ghost btn-sm" onClick={() => m.mutate()} disabled={m.isPending}>
          <Sparkles className="size-4 text-brand" /> {m.isPending ? 'Writing…' : label}
        </button>
      )}
      {m.error && <ErrorBox error={m.error} onRetry={() => m.mutate()} />}
      {m.data && (
        <div className="rounded-2xl border border-sky-deep bg-sky/30 p-4 text-sm leading-relaxed">
          <div className="mono-label mb-2 text-ink-soft">Explanation of the numbers above · AI-written from our calculation</div>
          <p className="whitespace-pre-line">{m.data.text}</p>
        </div>
      )}
    </div>
  )
}
