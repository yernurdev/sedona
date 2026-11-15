import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Download, Link2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { download, post } from '../api/client'
import { useCheckins } from '../api/hooks'
import type { Activity, CheckinResult } from '../api/types'
import { ErrorBox, SectionTitle, Spinner, Tag } from '../components/ui'
import { addDaysISO, fmtDate, shortDate, usd } from '../lib/format'

const methods = ['online', 'email', 'in person', 'phone', 'job fair', 'networking']
const results = ['applied', 'interviewed', 'no response', 'rejected', 'follow-up']

function fromLink(url: string): Partial<Activity> {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    const host = u.hostname.replace(/^www\.|^careers\.|^jobs\.|^boards\./g, '')
    let employer = host.split('.')[0]
    const parts = u.pathname.split('/').filter(Boolean)
    if (/greenhouse|lever|ashby|workday|myworkdayjobs|smartrecruiters/.test(host) && parts[0]) employer = parts[0]
    const slug = parts.find((p) => /[a-z]-[a-z]/i.test(p) && !/^\d+$/.test(p)) ?? ''
    const position = slug.replace(/[-_]+/g, ' ').replace(/\d+/g, '').trim()
    const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
    return { employer: cap(employer), position: cap(position), method: 'online', contact: u.href, result: 'applied' }
  } catch {
    return {}
  }
}

export default function Checkin() {
  const { caseId = '' } = useParams()
  const qc = useQueryClient()
  const list = useCheckins(caseId)
  const week = list.data?.currentWeek ?? ''
  const [acts, setActs] = useState<Activity[]>([])
  const [earnings, setEarnings] = useState('0')
  const [link, setLink] = useState('')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [runway, setRunway] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setActs([])
    setResult(null)
    setEarnings('0')
  }, [week])

  const today = list.data?.currentDate ?? ''
  const save = useMutation({
    mutationFn: () => post<{ checkin: CheckinResult; runway: { months: number } }>(`/cases/${caseId}/checkins`, { weekStart: week, activities: acts, earnings: Number(earnings) || 0 }),
    onSuccess: (r) => {
      setResult(r.checkin)
      setRunway(r.runway.months)
      qc.invalidateQueries({ queryKey: ['checkins', caseId] })
      qc.invalidateQueries({ queryKey: ['plan', caseId] })
    },
  })
  const addFromLink = () => {
    if (!link.trim()) return
    setActs((a) => [...a, { date: today, employer: '', position: '', method: 'online', contact: '', result: 'applied', ...fromLink(link.trim()) }])
    setLink('')
  }
  const upd = (i: number, k: keyof Activity, v: string) => setActs((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const required = list.data?.required ?? 0
  const valid = useMemo(() => acts.filter((a) => a.employer.trim()).length, [acts])

  if (list.isLoading) return <Spinner />
  if (list.error) return <div className="mx-auto max-w-xl px-4 py-16"><ErrorBox error={list.error} onRetry={() => list.refetch()} /></div>
  const d = list.data!
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <SectionTitle kicker={`Weekly check-in · week of ${fmtDate(week)}`} title="Don’t lose a single benefit check">
        {d.rule} {d.certification}.
      </SectionTitle>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="retro-card p-5">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Job search activities</div>
            <Tag tone={valid >= required && valid > 0 ? 'ok' : 'wine'}>{valid} / {required || '—'} logged</Tag>
          </div>
          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input className="field pl-9" placeholder="Paste a job link — we fill the rest" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFromLink()} />
            </div>
            <button className="btn btn-sky btn-sm" onClick={addFromLink}><Plus className="size-4" /> Add</button>
          </div>
          <button className="mono-label mt-2 text-ink-soft underline" onClick={() => setActs((a) => [...a, { date: today, employer: '', position: '', method: 'online', contact: '', result: 'applied' }])}>
            or add manually
          </button>
          <div className="mt-4 space-y-3">
            {acts.map((a, i) => (
              <div key={i} className="grid gap-2 rounded-2xl border border-line bg-white p-3 sm:grid-cols-6">
                <input className="field sm:col-span-2" placeholder="Employer" value={a.employer} onChange={(e) => upd(i, 'employer', e.target.value)} />
                <input className="field sm:col-span-2" placeholder="Position" value={a.position} onChange={(e) => upd(i, 'position', e.target.value)} />
                <input className="field sm:col-span-2" type="date" min={week} max={addDaysISO(week, 6)} value={a.date} onChange={(e) => upd(i, 'date', e.target.value)} />
                <select className="field sm:col-span-2" value={a.method} onChange={(e) => upd(i, 'method', e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</select>
                <select className="field sm:col-span-2" value={a.result} onChange={(e) => upd(i, 'result', e.target.value)}>{results.map((m) => <option key={m}>{m}</option>)}</select>
                <div className="flex gap-2 sm:col-span-2">
                  <input className="field" placeholder="Contact / link" value={a.contact} onChange={(e) => upd(i, 'contact', e.target.value)} />
                  <button className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => setActs((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <label className="mt-4 block text-sm">
            Earnings from part-time work this week ($)
            <input className="field mt-1 max-w-48" inputMode="decimal" value={earnings} onChange={(e) => setEarnings(e.target.value)} />
          </label>
          <button className="btn btn-primary mt-5" onClick={() => save.mutate()} disabled={save.isPending || acts.length === 0}>
            {save.isPending ? 'Checking…' : 'Check & build my record'}
          </button>
          {save.error && <div className="mt-3"><ErrorBox error={save.error} /></div>}
        </div>

        <div className="space-y-4">
          {result ? (
            <div className="retro-card-soft p-5">
              <div className="flex items-center gap-2">
                {result.compliant ? <Tag tone="ok"><Check className="size-3" /> ready to certify</Tag> : <Tag tone="wine">not enough yet</Tag>}
                <span className="text-sm text-ink-soft">certify by {fmtDate(result.nextCertificationDate)}</span>
              </div>
              {result.issues.length > 0 && <ul className="mt-3 space-y-1 text-sm text-wine">{result.issues.map((x) => <li key={x}>• {x}</li>)}</ul>}
              {result.earningsReminder && <p className="mt-3 rounded-xl bg-sky/40 p-3 text-sm">{result.earningsReminder}</p>}
              <pre className="num mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-3 text-xs text-cream">{result.record}</pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(result.record); setCopied(true) }}><Copy className="size-4" /> {copied ? 'Copied' : 'Copy for portal'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => download(`/cases/${caseId}/checkins/${result.weekStart}/record.csv`, `work-search-${result.weekStart}.csv`)}><Download className="size-4" /> CSV</button>
                <a className="btn btn-sky btn-sm" href={result.portalUrl} target="_blank" rel="noreferrer">Open portal</a>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink/30 p-5 text-sm text-ink-soft">Your ready-to-paste record for the state portal appears here.</div>
          )}
          <div className="retro-card-soft p-5">
            <div className="mono-label text-ink-soft">Runway now</div>
            <div className="num mt-1 text-4xl font-bold">{(runway ?? d.runway.months).toFixed(1)} <span className="text-base font-normal">months</span></div>
          </div>
          <div className="retro-card-soft p-5">
            <div className="font-semibold">History</div>
            {d.weeks.length === 0 ? <p className="mt-2 text-sm text-ink-soft">No weeks logged yet.</p> : (
              <ul className="mt-2 divide-y divide-dashed divide-line text-sm">
                {d.weeks.map((w) => (
                  <li key={w.weekStart} className="flex items-center justify-between py-2">
                    <span>Week of {shortDate(w.weekStart)}</span>
                    <span className="flex items-center gap-2">
                      {w.earnings > 0 && <span className="num text-ink-soft">{usd(w.earnings)}</span>}
                      <Tag tone={w.compliant ? 'ok' : 'wine'}>{w.activitiesCount}/{w.required}</Tag>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
