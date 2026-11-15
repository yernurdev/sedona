import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { ErrorBox, SectionTitle, Spinner, Tag } from '../components/ui'

type Src = { dataset: string; source: string; asOf: string; estimate: boolean }

export default function How() {
  const q = useQuery({ queryKey: ['sources'], queryFn: () => api<{ sources: Src[] }>('/meta/sources') })
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <SectionTitle kicker="Transparency" title="How we calculate">
        Our code does the math with published federal and state rules. AI only explains numbers and drafts emails. Values we could not confirm against an official table are marked estimate.
      </SectionTitle>
      <div className="mb-8 grid gap-3 text-sm sm:grid-cols-2">
        {[
          ['Marketplace price', 'Projected yearly income ÷ poverty line → applicable % (IRS) → your expected contribution. Tax credit = benchmark silver − contribution. No credit above 400%.'],
          ['COBRA', 'Your letter’s amount, or the KFF 2026 average employer premium × 102%.'],
          ['Runway', 'Weekly simulation: savings + net severance + unemployment − expenses − insurance.'],
          ['Clawback', 'Advance credit received − credit allowed at your new income. Repaid in full since 2026.'],
        ].map(([t, d]) => (
          <div key={t} className="retro-card-soft p-4"><div className="font-semibold">{t}</div><p className="mt-1 text-ink-soft">{d}</p></div>
        ))}
      </div>
      {q.isLoading && <Spinner label="Loading sources" />}
      {q.error && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="retro-card-soft overflow-x-auto p-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="mono-label text-left text-ink-soft"><tr><th className="p-3">Dataset</th><th>As of</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              {q.data.sources.map((s) => (
                <tr key={s.dataset} className="border-t border-dashed border-line">
                  <td className="p-3">{s.dataset}</td>
                  <td className="num">{s.asOf}</td>
                  <td>{s.estimate ? <Tag tone="muted">estimate</Tag> : <Tag tone="ok">official</Tag>}</td>
                  <td className="max-w-xs truncate"><a className="text-brand underline" href={s.source} target="_blank" rel="noreferrer">{new URL(s.source).hostname}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
