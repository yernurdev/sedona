import { useMutation } from '@tanstack/react-query'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { post } from '../api/client'
import { ErrorBox } from '../components/ui'

const ease = [0.22, 1, 0.36, 1] as const

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, delay, ease }}>
      {children}
    </motion.div>
  )
}

// Moves its child slower than the page scroll for a depth effect.
function Parallax({ children, distance = 60, className = '' }: { children: ReactNode; distance?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [distance, -distance])
  const rotate = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [1.5, -1.5])
  return (
    <motion.div ref={ref} style={{ y, rotate }} className={className}>
      {children}
    </motion.div>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="retro-card w-full max-w-md p-5 text-left">{children}</div>
}

const InsuranceVisual = () => (
  <Panel>
    <div className="text-[12px] text-ink-soft">Health insurance per month · Austin, TX · family of 3</div>
    {[
      ['COBRA', '$2,406', false],
      ['Marketplace (ACA)', '$734', true],
      ['Spouse’s plan', 'ask HR', false],
    ].map(([k, v, best]) => (
      <div key={k as string} className={`mt-2 flex items-baseline justify-between rounded-[10px] px-3 py-2.5 ${best ? 'bg-brand-soft' : 'bg-cream/70'}`}>
        <span className="text-sm">{k}</span>
        <span className={`num text-xl ${best ? 'font-semibold text-brand-deep' : 'text-ink-soft'}`}>{v}</span>
      </div>
    ))}
    <div className="mt-3 text-[12px] text-ink-soft">Elect COBRA by Jan 29 · retroactive if you need care</div>
  </Panel>
)

const CheckinVisual = () => (
  <Panel>
    <div className="flex items-center justify-between">
      <div className="text-[12px] text-ink-soft">Week of Nov 22 · Texas requires 3</div>
      <span className="rounded-[7px] bg-ok/10 px-2 py-0.5 text-[12px] font-medium text-ok">Ready to certify</span>
    </div>
    {['Acme · Marketing Manager', 'Globex · Brand Lead', 'Initech · Sr. Marketing Manager'].map((r) => (
      <div key={r} className="mt-2 flex items-center gap-2.5 rounded-[10px] bg-cream/70 px-3 py-2.5 text-sm">
        <span className="grid size-5 place-items-center rounded-[6px] bg-brand text-white"><Check className="size-3" /></span>
        {r}
      </div>
    ))}
    <div className="mt-3 text-[12px] text-ink-soft">Formatted for your state portal · CSV ready</div>
  </Panel>
)

const OfferVisual = () => (
  <Panel>
    <div className="text-[12px] text-ink-soft">Offer from Globex · $130,000 base</div>
    <div className="num mt-1 text-3xl font-medium tracking-[-0.05em]">$131,200<span className="text-base text-ink-soft"> / yr after benefits</span></div>
    <div className="mt-4 rounded-[10px] border border-wine/20 bg-wine/[.04] p-3 text-sm">
      <div className="font-medium text-wine-deep">You could owe $2,442 in April</div>
      <div className="mt-0.5 text-[13px] text-ink-soft">Report new income at healthcare.gov within 30 days.</div>
    </div>
  </Panel>
)

const TaxVisual = () => (
  <Panel>
    <div className="text-[12px] text-ink-soft">Tax preview · 2026</div>
    {[
      ['Unemployment benefits', '$3,462'],
      ['Tax still owed on them', '$415'],
      ['Severance withheld at 22%', '$5,060'],
    ].map(([k, v]) => (
      <div key={k} className="mt-2 flex justify-between border-b border-ink/[.06] pb-2 text-sm">
        <span className="text-ink-soft">{k}</span>
        <span className="num font-medium">{v}</span>
      </div>
    ))}
  </Panel>
)

const features = [
  { a: 'Insurance, decoded.', b: 'One honest price each.', d: 'COBRA, the Marketplace and your spouse’s plan, priced on the income you will actually have this year.', v: <InsuranceVisual /> },
  { a: 'Never miss a check.', b: 'Certify in a minute.', d: 'Paste job links, get a work search record formatted for your state portal, and watch your runway update.', v: <CheckinVisual /> },
  { a: 'Got an offer?', b: 'Leave without a surprise.', d: 'Value the offer after benefits, bridge the coverage gap and catch a subsidy clawback before it lands.', v: <OfferVisual /> },
  { a: 'Tax day.', b: 'Know before April.', d: 'Tax on unemployment and severance plus the Marketplace reconciliation, ahead of filing.', v: <TaxVisual /> },
]

export default function Landing() {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  const iconY = useTransform(scrollY, [0, 600], reduce ? [0, 0] : [0, 180])
  const iconRotate = useTransform(scrollY, [0, 600], reduce ? [-8, -8] : [-8, 18])
  const iconScale = useTransform(scrollY, [0, 600], reduce ? [1, 1] : [1, 0.8])
  const titleY = useTransform(scrollY, [0, 600], reduce ? [0, 0] : [0, 90])
  const heroFade = useTransform(scrollY, [0, 520], reduce ? [1, 1] : [1, 0.15])
  const sample = useMutation({
    mutationFn: () => post<{ caseId: string }>('/cases/sample', {}),
    onSuccess: (r) => nav(`/summary/${r.caseId}`),
  })
  return (
    <>
      <section className="glow -mt-[68px] pt-[68px]">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 text-center sm:pt-14">
          <motion.div style={{ y: iconY, rotate: iconRotate, scale: iconScale }} className="mx-auto w-fit">
            <motion.img
              src="/icon.png"
              alt=""
              aria-hidden
              className="size-24 drop-shadow-[0_24px_30px_rgba(30,40,60,.2)] sm:size-32"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: reduce ? 0 : [0, -6, 0] }}
              transition={{ opacity: { duration: 0.6 }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }}
            />
          </motion.div>
          <motion.div style={{ y: titleY, opacity: heroFade }}>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1, ease }}>
            <h1 className="mx-auto mt-8 max-w-4xl text-[46px] font-[460] leading-[1] sm:text-[84px]">
              Lose your job,
              <br />
              not your <span className="text-gradient">money</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-md text-[16px] leading-relaxed text-ink-soft">
              The money side of the months between jobs: insurance, unemployment, the offer and taxes. Decoded in two minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Link to="/start" className="btn btn-dark w-full sm:w-auto">
                Start my plan <span className="arrow"><ArrowUpRight className="size-3.5" /></span>
              </Link>
              <button className="btn btn-sky w-full sm:w-auto" onClick={() => sample.mutate()} disabled={sample.isPending}>
                {sample.isPending ? 'Opening sample…' : 'See a sample case'} <span className="arrow"><ArrowUpRight className="size-3.5" /></span>
              </button>
            </div>
            {sample.error && <div className="mx-auto mt-4 max-w-md text-left"><ErrorBox error={sample.error} onRetry={() => sample.mutate()} /></div>}
            <p className="mt-5 text-[12.5px] text-ink-soft">No login · No bank connection · No SSN</p>
          </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="grid gap-px overflow-hidden rounded-[16px] bg-ink/[.07] sm:grid-cols-3">
          {[
            ['$2,406', 'Average family COBRA premium per month in 2026', 'KFF, ×102%'],
            ['400%', 'of the poverty line: above it, subsidies stop', 'Since January 2026'],
            ['$0', 'cap on repaying excess subsidy', 'IRS, tax year 2026'],
          ].map(([v, d, s]) => (
            <div key={d} className="bg-cream p-6 sm:p-8">
              <div className="num text-5xl font-[460] tracking-[-0.06em] text-brand-deep">{v}</div>
              <p className="mt-3 text-[15px] leading-snug">{d}</p>
              <p className="mt-1 text-[12.5px] text-ink-soft">{s}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-24 px-4 py-24 sm:space-y-32 sm:py-32">
        {features.map((f, i) => (
          <div key={f.a} className="grid items-center gap-10 md:grid-cols-2">
            <Reveal className={i % 2 ? 'md:order-2' : ''}>
              <h2 className="text-[38px] font-[460] leading-[1.02] sm:text-[56px]">
                {f.a}
                <br />
                <span className="text-brand">{f.b}</span>
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">{f.d}</p>
              <Link to="/start" className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-deep transition-all hover:gap-2.5">
                Start my plan <ArrowRight className="size-4" />
              </Link>
            </Reveal>
            <Reveal delay={0.1} className={`flex ${i % 2 ? 'md:order-1 md:justify-start' : 'md:justify-end'}`}>
              <Parallax className="w-full max-w-md">{f.v}</Parallax>
            </Reveal>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 text-center">
        <Reveal>
          <h2 className="text-[44px] font-[460] leading-[1] sm:text-[72px]">
            We calculate.
            <br />
            <span className="text-brand">You decide.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">
            Every number shows its formula, source and date. We don’t sell insurance or take commissions, and we never ask for your SSN or bank login.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Link to="/start" className="btn btn-dark">Start my plan <span className="arrow"><ArrowUpRight className="size-3.5" /></span></Link>
            <Link to="/how" className="btn btn-sky">How we calculate <span className="arrow"><ArrowUpRight className="size-3.5" /></span></Link>
          </div>
        </Reveal>
      </section>
    </>
  )
}
