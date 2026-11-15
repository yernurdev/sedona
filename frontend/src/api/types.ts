export type Person = { relation: 'self' | 'spouse' | 'child' | 'dependent'; age: number }

export type CaseInput = {
  state: string
  household: Person[]
  lastDay: string
  coverageEndDate: string
  cobraNoticeDate: string | null
  annualSalary: number
  ytdWages: number
  severance: { gross: number; signBy?: string; paidOn?: string }
  insurance: { cobraMonthlyFromLetter: number | null; spousePlanMonthly: number | null; fsaBalance: number; hsaBalance: number }
  spouseAnnualIncome: number
  savings: number
  monthlyExpenses: number
  has401kLoan: boolean
  groupLayoff: boolean
  expectedReemployment: { weeks: number; salary: number }
}

export type CaseInfo = {
  caseId: string
  input: CaseInput
  isSample: boolean
  paid: boolean
  currentDate: string
  simOffsetDays: number
  state: { code: string; name: string; workSearchPerWeek: number; certification: string; portalUrl: string }
}

export type Deadline = {
  id: string; title: string; detail: string; date: string; daysLeft: number; source: string
  severity: 'high' | 'medium' | 'low' | 'passed'; passed: boolean
}

export type Summary = {
  caseId: string; isSample: boolean; paid: boolean; currentDate: string
  insurance: {
    cobraMonthly: number; acaMonthly: number; spouseMonthly: number | null
    cheapest: 'cobra' | 'aca' | 'spouse'; cheapestMonthly: number; estimate: boolean; why: string
    aca: { year: number; magi: number; fplPct: number; status: string; statusNote: string; benchmarkMonthly: number; subsidyMonthly: number } | null
  }
  runway: { months: number; basis: string; byOption: Record<'cobra' | 'aca' | 'spouse', number | null> }
  nextDeadline: Deadline | null
  deadlineCount: number
  lockedSections: string[]
  disclaimer: string
}

export type ACAQuote = {
  year: number; magi: number; fpl: number; fplYear: number; fplPct: number; applicablePct: number
  benchmarkMonthly: number; contributionMonthly: number; subsidyMonthly: number; netMonthly: number
  status: string; statusNote: string; estimate: boolean
  magiBreakdown: { wages: number; severance: number; unemployment: number; newJob: number; spouse: number; total: number }
}

export type InsuranceOption = {
  type: 'cobra' | 'aca' | 'spouse'; label: string; monthly: number | null; annual: number | null
  notes: string[]; source?: string; estimate: boolean; enrollBy?: string; quotes?: ACAQuote[]; enrollmentAptcMonthly?: number
}

export type RunwayOption = { type: string; months: number; endsOn?: string; beyondHorizon: boolean; insuranceMonthly: number; weeks?: { week: string; cash: number }[] }

export type Plan = {
  caseId: string; isSample: boolean; currentDate: string
  insurance: { options: InsuranceOption[]; cheapest: string; why: string; estimate: boolean }
  runway: { months: number; basis: string; byOption: Record<string, RunwayOption> }
  unemployment: {
    weeklyBenefit: number; maxWeeks: number; waitingWeek: boolean; totalPotential: number; formula: string
    workSearchRule: string; certification: string; howToFile: string[]; portalUrl: string; source: string; estimate: boolean
  }
  severance: { gross: number; federalWithheld: number; fica: number; stateWithheld: number; netEstimate: number; signBy?: string; paidOn?: string; questionsForHR: string[]; note: string }
  deadlines: Deadline[]
  actions: { today: string[]; thisWeek: string[]; thisMonth: string[] }
  calendarUrl: string
  disclaimer: string
}

export type Activity = { date: string; employer: string; position: string; method: string; contact: string; result: string }

export type CheckinResult = {
  weekStart: string; required: number; count: number; compliant: boolean; rule: string; record: string
  issues: string[]; activities: Activity[]; earnings: number; earningsReminder?: string; nextCertificationDate: string; portalUrl: string
}

export type CheckinList = {
  weeks: { weekStart: string; activitiesCount: number; required: number; compliant: boolean; earnings: number }[]
  currentWeek: string; currentDate: string; rule: string; required: number; certification: string; portalUrl: string
  runway: { months: number; basis: string; weeks: { week: string; cash: number }[] }
}

export type OfferInput = {
  company: string; salary: number; bonus: number; match401kPct: number; employeePremiumMonthly: number; deductible: number
  startDate: string; coverageStartsAfterDays: number
  currentCoverage: { type: 'aca' | 'cobra' | 'spouse' | 'none'; monthlyAptc: number; aptcStartMonth: string }
}

export type Clawback = { year: number; monthsOnAca: number; aptcReceived: number; allowedPtc: number; excess: number; newMagi: number; fplPct: number; reportBy: string; explanation: string; source: string }

export type OfferResult = {
  company: string; effectiveAnnual: number
  breakdown: { salary: number; bonus: number; match401k: number; premiums: number; expectedOutOfPocket: number }
  coverageGap: { days: number; newCoverageStart: string; cobraElectionDeadline: string; withinCobraWindow: boolean; bridgeAdvice: string }
  aptcClawback: Clawback | null
  assumptions: string[]
}

export type TaxPreview = {
  year: number; filingStatus: string; projectedIncome: number; taxableIncome: number; marginalRatePct: number
  unemploymentTaxable: number; unemploymentWithheld: number; unemploymentEstimatedOwed: number
  severanceGross: number; severanceWithheld: number; severanceExtraOwed: number
  aptc: Clawback | null; notes: string[]; source: string
}

export type StateMeta = { code: string; name: string; supported: boolean; workSearchPerWeek: number | null; portalUrl?: string }
