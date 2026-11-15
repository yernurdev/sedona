package calc

import (
	"math"
	"time"
)

type Unemployment struct {
	WeeklyBenefit  int64    `json:"weeklyBenefit"`
	MaxWeeks       int      `json:"maxWeeks"`
	WaitingWeek    bool     `json:"waitingWeek"`
	TotalPotential int64    `json:"totalPotential"`
	Formula        string   `json:"formula"`
	WorkSearchRule string   `json:"workSearchRule"`
	Certification  string   `json:"certification"`
	HowToFile      []string `json:"howToFile"`
	PortalURL      string   `json:"portalUrl"`
	Source         string   `json:"source"`
	Estimate       bool     `json:"estimate"`
}

func (e *Engine) WeeklyBenefit(in *CaseInput) Cents {
	b := e.T.States[in.State].Benefit
	highQuarter := in.AnnualSalary / 4
	wba := math.Floor(highQuarter * b.HighQuarterFraction)
	wba = math.Max(float64(b.MinWeekly), math.Min(float64(b.MaxWeekly), wba))
	if in.AnnualSalary == 0 {
		wba = 0
	}
	return Dollars(wba)
}

func (e *Engine) Unemployment(in *CaseInput) Unemployment {
	s := e.T.States[in.State]
	wba := e.WeeklyBenefit(in)
	return Unemployment{
		WeeklyBenefit:  wba.Whole(),
		MaxWeeks:       s.Benefit.MaxWeeks,
		WaitingWeek:    s.Benefit.WaitingWeek,
		TotalPotential: (wba * Cents(s.Benefit.MaxWeeks)).Whole(),
		Formula:        "Weekly benefit ≈ " + pctString(s.Benefit.HighQuarterFraction) + " of your highest-quarter wages (salary ÷ 4), capped at the state maximum.",
		WorkSearchRule: s.WorkSearch.Rule,
		Certification:  s.Certification.Label,
		HowToFile:      s.HowToFile,
		PortalURL:      s.PortalURL,
		Source:         s.Source,
		Estimate:       true,
	}
}

// uiPaidWeeks returns the start dates of benefit weeks that are paid,
// beginning the day after the last day of work and stopping at reemployment.
func (e *Engine) uiPaidWeeks(in *CaseInput, lastDay, reemployed time.Time) []time.Time {
	b := e.T.States[in.State].Benefit
	skip := 0
	if b.WaitingWeek {
		skip = 1
	}
	var out []time.Time
	for k := skip; k < skip+b.MaxWeeks; k++ {
		start := addDays(lastDay, 1+7*k)
		if !start.Before(reemployed) {
			break
		}
		out = append(out, start)
	}
	return out
}

func pctString(f float64) string {
	p := f * 100
	if math.Abs(p-math.Round(p)) < 0.01 {
		return itoa(int64(math.Round(p))) + "%"
	}
	return trimFloat(p) + "%"
}
