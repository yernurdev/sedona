package calc

import (
	"math"
	"sort"
	"time"
)

// IncomePlan describes when a new job starts and what it pays.
type IncomePlan struct {
	Reemployed time.Time
	NewSalary  float64
}

type MAGIBreakdown struct {
	Year         int   `json:"year"`
	Wages        int64 `json:"wages"`
	Severance    int64 `json:"severance"`
	Unemployment int64 `json:"unemployment"`
	NewJob       int64 `json:"newJob"`
	Spouse       int64 `json:"spouse"`
	Total        int64 `json:"total"`
}

// MAGI projects modified adjusted gross income for a coverage year (spec 6.1, simplified).
func (e *Engine) MAGI(in *CaseInput, d *Dates, year int, plan IncomePlan) (Cents, MAGIBreakdown) {
	var wages, sev, ui, job Cents
	if d.LastDay.Year() == year {
		wages = Dollars(in.YTDWages)
	}
	if d.SeverancePaid.Year() == year {
		sev = Dollars(in.Severance.Gross)
	}
	wba := e.WeeklyBenefit(in)
	for _, w := range e.uiPaidWeeks(in, d.LastDay, plan.Reemployed) {
		if w.Year() == year {
			ui += wba
		}
	}
	yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(year+1, 1, 1, 0, 0, 0, 0, time.UTC)
	if plan.Reemployed.Before(yearEnd) {
		from := plan.Reemployed
		if from.Before(yearStart) {
			from = yearStart
		}
		days := daysBetween(from, yearEnd)
		job = Dollars(plan.NewSalary).Mul(float64(days) / float64(daysBetween(yearStart, yearEnd)))
	}
	spouse := Dollars(in.SpouseAnnualIncome)
	total := wages + sev + ui + job + spouse
	return total, MAGIBreakdown{year, wages.Whole(), sev.Whole(), ui.Whole(), job.Whole(), spouse.Whole(), total.Whole()}
}

type ACAQuote struct {
	Year                int           `json:"year"`
	MAGI                int64         `json:"magi"`
	MAGIBreakdown       MAGIBreakdown `json:"magiBreakdown"`
	FPL                 int64         `json:"fpl"`
	FPLYear             int           `json:"fplYear"`
	FPLPct              int           `json:"fplPct"`
	ApplicablePct       float64       `json:"applicablePct"`
	BenchmarkMonthly    int64         `json:"benchmarkMonthly"`
	ContributionMonthly int64         `json:"contributionMonthly"`
	SubsidyMonthly      int64         `json:"subsidyMonthly"`
	NetMonthly          int64         `json:"netMonthly"`
	Status              string        `json:"status"`
	StatusNote          string        `json:"statusNote"`
	Estimate            bool          `json:"estimate"`
}

func (e *Engine) benchmarkMonthly(in *CaseInput, year int) (Cents, bool, error) {
	base, est, err := e.T.Benchmark40(year, in.State)
	if err != nil {
		return 0, false, err
	}
	var kids, adults []int
	for _, p := range in.Household {
		if p.Age < 21 {
			kids = append(kids, p.Age)
		} else {
			adults = append(adults, p.Age)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(kids)))
	if len(kids) > 3 {
		kids = kids[:3]
	}
	f40 := e.T.AgeFactor(40)
	var sum float64
	for _, a := range append(adults, kids...) {
		sum += e.T.AgeFactor(a) / f40
	}
	return Dollars(float64(base)).Mul(sum), est, nil
}

// ACAQuoteFor computes the benchmark-plan net price after the premium tax credit (spec 6.2).
func (e *Engine) ACAQuoteFor(in *CaseInput, d *Dates, year int, plan IncomePlan) (ACAQuote, error) {
	magi, br := e.MAGI(in, d, year, plan)
	q := ACAQuote{Year: year, MAGI: magi.Whole(), MAGIBreakdown: br, FPLYear: year - 1}
	fpl, _, err := e.T.FPLFor(year-1, len(in.Household))
	if err != nil {
		return q, err
	}
	bench, _, err := e.benchmarkMonthly(in, year)
	if err != nil {
		return q, err
	}
	q.FPL = fpl
	q.BenchmarkMonthly = bench.Whole()
	q.Estimate = true
	pct := float64(magi) / float64(Dollars(float64(fpl))) * 100
	q.FPLPct = int(math.Round(pct))
	expansion := e.T.States[in.State].MedicaidExpansion
	switch {
	case expansion && pct < 138:
		q.Status = "medicaid_likely"
		q.StatusNote = "Projected income is under 138% of the poverty line. In this state you may qualify for Medicaid, which is usually free or low cost."
		q.NetMonthly = 0
		return q, nil
	case !expansion && pct < 100:
		q.Status = "coverage_gap"
		q.StatusNote = "Projected income is under 100% of the poverty line. This state did not expand Medicaid, so Marketplace subsidies may not apply. Check healthcare.gov."
		q.NetMonthly = bench.Whole()
		return q, nil
	case pct >= 400:
		q.Status = "over_cliff"
		q.StatusNote = "Projected income is above 400% of the poverty line, so there is no subsidy (the cliff returned in 2026)."
		q.NetMonthly = bench.Whole()
		return q, nil
	}
	ap, _, err := e.T.ApplicablePercent(year, pct)
	if err != nil {
		return q, err
	}
	contribution := magi.Mul(ap / 100).Div(12)
	subsidy := maxC(0, bench-contribution)
	q.Status = "subsidy"
	q.ApplicablePct = math.Round(ap*100) / 100
	q.ContributionMonthly = contribution.Whole()
	q.SubsidyMonthly = subsidy.Whole()
	q.NetMonthly = (bench - subsidy).Whole()
	q.StatusNote = "Your expected share is " + trimFloat(q.ApplicablePct) + "% of projected income; the tax credit covers the rest of the benchmark silver plan."
	return q, nil
}

func (e *Engine) CobraMonthly(in *CaseInput) (Cents, bool) {
	if in.Insurance.CobraMonthlyFromLetter != nil && *in.Insurance.CobraMonthlyFromLetter > 0 {
		return Dollars(*in.Insurance.CobraMonthlyFromLetter), false
	}
	annual := e.T.Cobra.SingleAnnual
	if len(in.Household) > 1 {
		annual = e.T.Cobra.FamilyAnnual
	}
	return Dollars(float64(annual)).Mul(e.T.Cobra.CobraMultiplier).Div(12), true
}

func (e *Engine) SpouseMonthly(in *CaseInput) *Cents {
	if in.Insurance.SpousePlanMonthly == nil {
		return nil
	}
	c := Dollars(*in.Insurance.SpousePlanMonthly)
	return &c
}

// ACAOverMonths returns the quote per coverage year touched by the next n months
// after old coverage ends, plus the month-weighted average net price.
func (e *Engine) ACAOverMonths(in *CaseInput, d *Dates, n int, plan IncomePlan) ([]ACAQuote, Cents, error) {
	start := firstOfMonth(addDays(d.CoverageEnd, 1))
	months := map[int]int{}
	var years []int
	for i := 0; i < n; i++ {
		y := start.AddDate(0, i, 0).Year()
		if months[y] == 0 {
			years = append(years, y)
		}
		months[y]++
	}
	var quotes []ACAQuote
	var total Cents
	for _, y := range years {
		q, err := e.ACAQuoteFor(in, d, y, plan)
		if err != nil {
			return nil, 0, err
		}
		quotes = append(quotes, q)
		total += Dollars(float64(q.NetMonthly)) * Cents(months[y])
	}
	return quotes, total.Div(int64(n)), nil
}

func (e *Engine) acaMonthlyByYear(quotes []ACAQuote) map[int]Cents {
	m := map[int]Cents{}
	for _, q := range quotes {
		m[q.Year] = Dollars(float64(q.NetMonthly))
	}
	return m
}
