package calc

import (
	"errors"
	"time"
)

type CurrentCoverage struct {
	Type           string  `json:"type"`
	MonthlyAPTC    float64 `json:"monthlyAptc"`
	APTCStartMonth string  `json:"aptcStartMonth"`
}

type OfferInput struct {
	Company                 string          `json:"company"`
	Salary                  float64         `json:"salary"`
	Bonus                   float64         `json:"bonus"`
	Match401kPct            float64         `json:"match401kPct"`
	EmployeePremiumMonthly  float64         `json:"employeePremiumMonthly"`
	Deductible              float64         `json:"deductible"`
	StartDate               string          `json:"startDate"`
	CoverageStartsAfterDays int             `json:"coverageStartsAfterDays"`
	CurrentCoverage         CurrentCoverage `json:"currentCoverage"`
}

type OfferBreakdown struct {
	Salary      int64 `json:"salary"`
	Bonus       int64 `json:"bonus"`
	Match401k   int64 `json:"match401k"`
	Premiums    int64 `json:"premiums"`
	ExpectedOOP int64 `json:"expectedOutOfPocket"`
}

type CoverageGap struct {
	Days                  int    `json:"days"`
	NewCoverageStart      string `json:"newCoverageStart"`
	CobraElectionDeadline string `json:"cobraElectionDeadline"`
	WithinCobraWindow     bool   `json:"withinCobraWindow"`
	BridgeAdvice          string `json:"bridgeAdvice"`
}

type Clawback struct {
	Year         int    `json:"year"`
	MonthsOnACA  int    `json:"monthsOnAca"`
	APTCReceived int64  `json:"aptcReceived"`
	AllowedPTC   int64  `json:"allowedPtc"`
	Excess       int64  `json:"excess"`
	NewMAGI      int64  `json:"newMagi"`
	FPLPct       int    `json:"fplPct"`
	ReportBy     string `json:"reportBy"`
	Explanation  string `json:"explanation"`
	Source       string `json:"source"`
}

type OfferResult struct {
	Company         string         `json:"company"`
	EffectiveAnnual int64          `json:"effectiveAnnual"`
	Breakdown       OfferBreakdown `json:"breakdown"`
	CoverageGap     CoverageGap    `json:"coverageGap"`
	APTCClawback    *Clawback      `json:"aptcClawback"`
	Assumptions     []string       `json:"assumptions"`
}

const expectedOOPShare = 0.5

func (o *OfferInput) Validate() (time.Time, error) {
	if o.Salary <= 0 || o.Salary > 10_000_000 {
		return time.Time{}, errors.New("salary must be between 1 and 10,000,000")
	}
	if o.Bonus < 0 || o.Match401kPct < 0 || o.Match401kPct > 100 || o.EmployeePremiumMonthly < 0 || o.Deductible < 0 {
		return time.Time{}, errors.New("amounts must be zero or more")
	}
	if o.CoverageStartsAfterDays < 0 || o.CoverageStartsAfterDays > 365 {
		return time.Time{}, errors.New("coverageStartsAfterDays must be 0 to 365")
	}
	t, err := ParseDate(o.StartDate)
	if err != nil {
		return time.Time{}, errors.New("startDate must be YYYY-MM-DD")
	}
	return t, nil
}

// Offer compares an offer net of benefits and checks the coverage bridge and subsidy clawback (spec 6.10).
func (e *Engine) Offer(in *CaseInput, d *Dates, o OfferInput) (OfferResult, error) {
	start, err := o.Validate()
	if err != nil {
		return OfferResult{}, err
	}
	salary := Dollars(o.Salary)
	b := OfferBreakdown{
		Salary: salary.Whole(), Bonus: Dollars(o.Bonus).Whole(),
		Match401k:   salary.Mul(o.Match401kPct / 100).Whole(),
		Premiums:    (Dollars(o.EmployeePremiumMonthly) * 12).Whole(),
		ExpectedOOP: Dollars(o.Deductible).Mul(expectedOOPShare).Whole(),
	}
	res := OfferResult{
		Company:         o.Company,
		EffectiveAnnual: b.Salary + b.Bonus + b.Match401k - b.Premiums - b.ExpectedOOP,
		Breakdown:       b,
		Assumptions:     []string{"Expected out-of-pocket = 50% of the deductible (moderate-use assumption)."},
	}

	newCov := addDays(start, o.CoverageStartsAfterDays)
	election := e.CobraElectionDeadline(d)
	gap := CoverageGap{NewCoverageStart: fmtDate(newCov), CobraElectionDeadline: fmtDate(election)}
	gap.WithinCobraWindow = !newCov.After(election)
	switch o.CurrentCoverage.Type {
	case "aca":
		gap.BridgeAdvice = "Based on these dates, a Marketplace plan kept through " + fmtDate(addDays(firstOfMonth(newCov), -1)) + " would leave no gap. Ending it requires a cancellation at healthcare.gov."
	case "spouse":
		gap.BridgeAdvice = "Coverage through your spouse's plan continues; no gap based on these dates."
	default:
		gap.Days = daysBetween(addDays(d.CoverageEnd, 1), newCov)
		if gap.Days < 0 {
			gap.Days = 0
		}
		if gap.WithinCobraWindow {
			gap.BridgeAdvice = "New coverage starts " + fmtDate(newCov) + ", inside your COBRA election window (until " + fmtDate(election) + "). COBRA elected within the window is retroactive, so the gap can be covered after the fact, paying premiums only if you elect."
		} else {
			gap.BridgeAdvice = "The " + itoa(int64(gap.Days)) + "-day gap runs past your COBRA election window (" + fmtDate(election) + "). Retroactive COBRA would not cover the full gap; compare COBRA and Marketplace options before the window closes."
		}
	}
	res.CoverageGap = gap

	if o.CurrentCoverage.Type == "aca" && o.CurrentCoverage.MonthlyAPTC > 0 {
		cb, err := e.clawback(in, d, o, start, newCov)
		if err != nil {
			return res, err
		}
		res.APTCClawback = cb
	}
	return res, nil
}

func (e *Engine) clawback(in *CaseInput, d *Dates, o OfferInput, start, newCov time.Time) (*Clawback, error) {
	year := start.Year()
	aptcFrom := firstOfMonth(addDays(d.CoverageEnd, 1))
	if o.CurrentCoverage.APTCStartMonth != "" {
		if t, err := time.Parse("2006-01", o.CurrentCoverage.APTCStartMonth); err == nil {
			aptcFrom = t
		}
	}
	months := 0
	for m := 1; m <= 12; m++ {
		ms := time.Date(year, time.Month(m), 1, 0, 0, 0, 0, time.UTC)
		if !ms.Before(aptcFrom) && ms.Before(newCov) {
			months++
		}
	}
	q, err := e.ACAQuoteFor(in, d, year, IncomePlan{Reemployed: start, NewSalary: o.Salary + o.Bonus})
	if err != nil {
		return nil, err
	}
	allowedMonthly := Cents(0)
	if q.Status == "subsidy" {
		allowedMonthly = Dollars(float64(q.SubsidyMonthly))
	}
	received := Dollars(o.CurrentCoverage.MonthlyAPTC) * Cents(months)
	allowed := allowedMonthly * Cents(months)
	excess := maxC(0, received-allowed)
	rule := e.T.Deadlines.Rules["aca_report_income"]
	cb := &Clawback{
		Year: year, MonthsOnACA: months, APTCReceived: received.Whole(), AllowedPTC: allowed.Whole(),
		Excess: excess.Whole(), NewMAGI: q.MAGI, FPLPct: q.FPLPct,
		ReportBy: fmtDate(addDays(start, rule.Days)), Source: rule.Source,
	}
	if excess > 0 {
		cb.Explanation = "With this offer your projected " + itoa(int64(year)) + " income is " + usd(Dollars(float64(q.MAGI))) + " (" + itoa(int64(q.FPLPct)) + "% of the poverty line). Report your new income at healthcare.gov by " + cb.ReportBy + ". If you don't, you could owe about " + usd(excess) + " at tax time; since 2026 there is no repayment cap."
	} else {
		cb.Explanation = "Based on these numbers, the advance subsidy you receive stays within what your projected " + itoa(int64(year)) + " income allows. Still report the new income by " + cb.ReportBy + "."
	}
	return cb, nil
}
