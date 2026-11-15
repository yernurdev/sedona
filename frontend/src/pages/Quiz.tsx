import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm, type FieldPath } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { post } from '../api/client'
import { useStates } from '../api/hooks'
import type { CaseInput, Person } from '../api/types'
import { ErrorBox } from '../components/ui'

const money = (label: string, required = true) =>
  z.string().refine((v) => (v.trim() === '' ? !required : !Number.isNaN(Number(v.replace(/[,$\s]/g, ''))) && Number(v.replace(/[,$\s]/g, '')) >= 0), {
    message: required ? `Enter ${label} (0 if none)` : `Enter a valid amount`,
  })
const date = (label: string, required = true) =>
  z.string().refine((v) => (v === '' ? !required : /^\d{4}-\d{2}-\d{2}$/.test(v)), { message: `Pick ${label}` })

const schema = z
  .object({
    state: z.string().min(2, 'Pick your state'),
    lastDay: date('your last day'),
    coverageEndDate: date('when coverage ends'),
    cobraNoticeDate: date('a date', false),
    annualSalary: money('your salary'),
    ytdWages: money('wages so far', false),
    severanceGross: money('severance'),
    severanceSignBy: date('a date', false),
    severancePaidOn: date('a date', false),
    groupLayoff: z.boolean(),
    selfAge: z.string().refine((v) => Number(v) >= 18 && Number(v) <= 99, 'Age 18–99'),
    hasSpouse: z.boolean(),
    spouseAge: z.string(),
    spouseIncome: money('spouse income', false),
    kids: z.string().refine((v) => v.trim() === '' || v.split(',').every((a) => /^\s*\d{1,2}\s*$/.test(a)), 'Ages separated by commas, e.g. 6, 9'),
    cobraLetter: money('COBRA amount', false),
    spousePlan: money('spouse plan cost', false),
    fsaBalance: money('FSA balance', false),
    savings: money('your savings'),
    monthlyExpenses: money('monthly expenses'),
    has401kLoan: z.boolean(),
    weeks: z.string().refine((v) => Number(v) >= 1 && Number(v) <= 104, '1–104 weeks'),
    newSalary: money('expected salary', false),
  })
  .refine((v) => !v.hasSpouse || (Number(v.spouseAge) >= 18 && Number(v.spouseAge) <= 99), { path: ['spouseAge'], message: 'Spouse age 18–99' })
  .refine((v) => v.coverageEndDate >= v.lastDay, { path: ['coverageEndDate'], message: 'Coverage can’t end before your last day' })

type Form = z.infer<typeof schema>

const today = new Date().toISOString().slice(0, 10)
const endOfMonth = (() => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
})()

const steps: { title: string; hint: string; fields: FieldPath<Form>[] }[] = [
  { title: 'Where do you live?', hint: 'Unemployment rules and Medicaid depend on your state.', fields: ['state'] },
  { title: 'Key dates', hint: 'Every deadline is counted from these.', fields: ['lastDay', 'coverageEndDate', 'cobraNoticeDate'] },
  { title: 'Pay and severance', hint: 'Gross amounts, before tax.', fields: ['annualSalary', 'ytdWages', 'severanceGross', 'severanceSignBy', 'severancePaidOn', 'groupLayoff'] },
  { title: 'Who is on your health plan?', hint: 'Premiums and subsidies depend on ages and household size.', fields: ['selfAge', 'hasSpouse', 'spouseAge', 'spouseIncome', 'kids'] },
  { title: 'Insurance details', hint: 'Optional, but makes the numbers exact.', fields: ['cobraLetter', 'spousePlan', 'fsaBalance'] },
  { title: 'Your cushion', hint: 'Used for the runway: how long your money lasts.', fields: ['savings', 'monthlyExpenses', 'has401kLoan'] },
  { title: 'Your job search', hint: 'Your best guess. Median search is about 13 weeks (BLS).', fields: ['weeks', 'newSalary'] },
  { title: 'Review', hint: 'Check the numbers, then see your three big numbers.', fields: [] },
]

const num = (s: string) => Number(s.replace(/[,$\s]/g, '') || 0)

function toInput(v: Form): CaseInput {
  const household: Person[] = [{ relation: 'self', age: Number(v.selfAge) }]
  if (v.hasSpouse) household.push({ relation: 'spouse', age: Number(v.spouseAge) })
  v.kids.split(',').map((s) => s.trim()).filter(Boolean).forEach((a) => household.push({ relation: 'child', age: Number(a) }))
  const salary = num(v.annualSalary)
  const ytd = v.ytdWages.trim() === '' ? Math.round((salary * dayOfYear(v.lastDay)) / 365) : num(v.ytdWages)
  return {
    state: v.state,
    household,
    lastDay: v.lastDay,
    coverageEndDate: v.coverageEndDate,
    cobraNoticeDate: v.cobraNoticeDate || null,
    annualSalary: salary,
    ytdWages: ytd,
    severance: { gross: num(v.severanceGross), signBy: v.severanceSignBy || undefined, paidOn: v.severancePaidOn || undefined },
    insurance: {
      cobraMonthlyFromLetter: v.cobraLetter.trim() ? num(v.cobraLetter) : null,
      spousePlanMonthly: v.hasSpouse && v.spousePlan.trim() ? num(v.spousePlan) : null,
      fsaBalance: num(v.fsaBalance),
      hsaBalance: 0,
    },
    spouseAnnualIncome: v.hasSpouse ? num(v.spouseIncome) : 0,
    savings: num(v.savings),
    monthlyExpenses: num(v.monthlyExpenses),
    has401kLoan: v.has401kLoan,
    groupLayoff: v.groupLayoff,
    expectedReemployment: { weeks: Number(v.weeks), salary: v.newSalary.trim() ? num(v.newSalary) : salary },
  }
}

function dayOfYear(iso: string) {
  const d = new Date(iso + 'T00:00:00Z')
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs text-wine">{error}</span>}
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${checked ? 'border-ink bg-sky/50' : 'border-line bg-white'}`}
      aria-pressed={checked}
    >
      {label}
      <span className={`relative h-6 w-11 rounded-full border border-ink transition-colors ${checked ? 'bg-wine' : 'bg-cream-deep'}`}>
        <span className={`absolute top-0.5 size-4.5 rounded-full border border-ink bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

export default function Quiz() {
  const nav = useNavigate()
  const states = useStates()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const { register, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      state: '', lastDay: today, coverageEndDate: endOfMonth, cobraNoticeDate: '', annualSalary: '', ytdWages: '',
      severanceGross: '0', severanceSignBy: '', severancePaidOn: '', groupLayoff: false, selfAge: '', hasSpouse: false,
      spouseAge: '', spouseIncome: '0', kids: '', cobraLetter: '', spousePlan: '', fsaBalance: '0', savings: '',
      monthlyExpenses: '', has401kLoan: false, weeks: '13', newSalary: '',
    },
  })
  const create = useMutation({
    mutationFn: (v: Form) => post<{ caseId: string }>('/cases', toInput(v)),
    onSuccess: (r) => nav(`/summary/${r.caseId}`),
  })
  const v = watch()
  const selected = states.data?.states.find((s) => s.code === v.state)
  const unsupported = selected && !selected.supported

  const next = async () => {
    const ok = await trigger(steps[step].fields)
    if (!ok || unsupported) return
    setDir(1)
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }
  const back = () => {
    setDir(-1)
    setStep((s) => Math.max(0, s - 1))
  }
  const e = (k: keyof Form) => errors[k]?.message as string | undefined
  const input = (k: keyof Form, props: Record<string, unknown> = {}) => <input className="field" {...register(k)} {...props} />

  const body: ReactNode[] = [
    <div className="space-y-4" key="s0">
      <Field label="State" error={e('state')}>
        <select className="field" {...register('state')}>
          <option value="">Choose your state…</option>
          {states.data?.states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
              {s.supported ? '' : ' — coming soon'}
            </option>
          ))}
        </select>
      </Field>
      {states.error && <ErrorBox error={states.error} onRetry={() => states.refetch()} />}
      {unsupported && (
        <div className="rounded-2xl border border-wine/40 bg-wine/5 p-4 text-sm">
          <b>{selected.name} is coming soon.</b> We only show numbers we can source, so we support Missouri, Texas, Michigan, California and Florida
          today. Try the sample case to see how it works.
        </div>
      )}
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="s1">
      <Field label="Last day of work" error={e('lastDay')}>{input('lastDay', { type: 'date' })}</Field>
      <Field label="Health coverage ends" hint="Often the last day of the month" error={e('coverageEndDate')}>{input('coverageEndDate', { type: 'date' })}</Field>
      <Field label="COBRA notice received (optional)" hint="Leave empty if not received yet" error={e('cobraNoticeDate')}>{input('cobraNoticeDate', { type: 'date' })}</Field>
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="s2">
      <Field label="Annual salary ($)" error={e('annualSalary')}>{input('annualSalary', { inputMode: 'decimal', placeholder: '92,000' })}</Field>
      <Field label="Wages paid this year so far ($)" hint="Empty = estimated from salary" error={e('ytdWages')}>{input('ytdWages', { inputMode: 'decimal' })}</Field>
      <Field label="Severance, gross ($)" error={e('severanceGross')}>{input('severanceGross', { inputMode: 'decimal' })}</Field>
      <Field label="Sign agreement by (optional)" error={e('severanceSignBy')}>{input('severanceSignBy', { type: 'date' })}</Field>
      <Field label="Severance paid on (optional)" error={e('severancePaidOn')}>{input('severancePaidOn', { type: 'date' })}</Field>
      <div className="self-end"><Toggle label="Part of a group layoff" checked={v.groupLayoff} onChange={(x) => setValue('groupLayoff', x)} /></div>
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="s3">
      <Field label="Your age" error={e('selfAge')}>{input('selfAge', { inputMode: 'numeric', placeholder: '38' })}</Field>
      <div className="self-end"><Toggle label="Spouse on the plan" checked={v.hasSpouse} onChange={(x) => setValue('hasSpouse', x)} /></div>
      {v.hasSpouse && (
        <>
          <Field label="Spouse’s age" error={e('spouseAge')}>{input('spouseAge', { inputMode: 'numeric' })}</Field>
          <Field label="Spouse’s annual income ($)" error={e('spouseIncome')}>{input('spouseIncome', { inputMode: 'decimal' })}</Field>
        </>
      )}
      <Field label="Children’s ages (optional)" hint="Comma separated, e.g. 6, 9" error={e('kids')}>{input('kids', { placeholder: '6' })}</Field>
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="s4">
      <Field label="COBRA monthly cost from your letter ($)" hint="Empty = we estimate from KFF averages" error={e('cobraLetter')}>{input('cobraLetter', { inputMode: 'decimal' })}</Field>
      {v.hasSpouse && (
        <Field label="Cost to join spouse’s plan, monthly ($)" hint="Ask your spouse’s HR. Optional" error={e('spousePlan')}>{input('spousePlan', { inputMode: 'decimal' })}</Field>
      )}
      <Field label="Health FSA balance left ($)" error={e('fsaBalance')}>{input('fsaBalance', { inputMode: 'decimal' })}</Field>
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="s5">
      <Field label="Savings you can use ($)" hint="Not counting severance" error={e('savings')}>{input('savings', { inputMode: 'decimal', placeholder: '18,000' })}</Field>
      <Field label="Essential expenses per month ($)" hint="Rent, food, debt, excluding health insurance" error={e('monthlyExpenses')}>{input('monthlyExpenses', { inputMode: 'decimal', placeholder: '5,200' })}</Field>
      <div className="sm:col-span-2"><Toggle label="I have an outstanding 401(k) loan" checked={v.has401kLoan} onChange={(x) => setValue('has401kLoan', x)} /></div>
    </div>,
    <div className="grid gap-4 sm:grid-cols-2" key="s6">
      <Field label="Weeks until a new job (your guess)" error={e('weeks')}>{input('weeks', { inputMode: 'numeric' })}</Field>
      <Field label="Expected new salary ($)" hint="Empty = same as before" error={e('newSalary')}>{input('newSalary', { inputMode: 'decimal' })}</Field>
    </div>,
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" key="s7">
      {[
        ['State', selected?.name ?? v.state],
        ['Last day / coverage ends', `${v.lastDay} / ${v.coverageEndDate}`],
        ['Salary', `$${v.annualSalary}`],
        ['Severance', `$${v.severanceGross}`],
        ['Household', `${1 + (v.hasSpouse ? 1 : 0) + v.kids.split(',').filter((s) => s.trim()).length} people`],
        ['Savings / expenses', `$${v.savings} / $${v.monthlyExpenses} per month`],
        ['Job search', `${v.weeks} weeks`],
      ].map(([k, val]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-dashed border-line py-2">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="num text-right font-medium">{val}</dd>
        </div>
      ))}
    </dl>,
  ]

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="mono-label text-ink-soft">
          Step {step + 1} / {steps.length}
        </div>
        <div className="flex flex-1 gap-1">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-wine' : 'bg-line'}`} />
          ))}
        </div>
      </div>
      <form onSubmit={handleSubmit((vals) => create.mutate(vals))} className="retro-card p-6 sm:p-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 * dir }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <h1 className="text-2xl font-semibold sm:text-3xl">{steps[step].title}</h1>
            <p className="mb-6 mt-1 text-ink-soft">{steps[step].hint}</p>
            {body[step]}
          </motion.div>
        </AnimatePresence>
        {create.error && <div className="mt-5"><ErrorBox error={create.error} /></div>}
        <div className="mt-8 flex items-center justify-between">
          <button type="button" className="btn btn-ghost" onClick={back} disabled={step === 0}>
            <ArrowLeft className="size-4" /> Back
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={next} disabled={!!unsupported}>
              Next <ArrowRight className="size-4" />
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Calculating…' : 'See my numbers'}
            </button>
          )}
        </div>
      </form>
      <p className="mt-4 text-center text-xs text-ink-soft">We only ask for numbers and dates. No SSN, no account numbers, no bank login.</p>
    </div>
  )
}
