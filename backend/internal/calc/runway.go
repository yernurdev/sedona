package calc

import (
	"math"
	"time"
)

const runwayHorizonWeeks = 156

type RunwayPoint struct {
	Week string `json:"week"`
	Cash int64  `json:"cash"`
}

type RunwayOption struct {
	Type    string        `json:"type"`
	Months  float64       `json:"months"`
	EndsOn  string        `json:"endsOn,omitempty"`
	Beyond  bool          `json:"beyondHorizon"`
	Weeks   []RunwayPoint `json:"weeks,omitempty"`
	Monthly int64         `json:"insuranceMonthly"`
}

// RunwayInput collects everything the weekly cash simulation needs.
type RunwayInput struct {
	Start     time.Time
	Current   time.Time
	Earnings  map[string]Cents
	Insurance func(t time.Time) Cents
}

// earningEntry is a pre-parsed earnings entry used to avoid repeated ParseDate
// calls inside the hot loop.
type earningEntry struct {
	date   time.Time
	amount Cents
}

// Runway simulates cash week by week assuming no new job (spec 6.7).
func (e *Engine) Runway(in *CaseInput, d *Dates, r RunwayInput) RunwayOption {
	sevNet, _, _, _ := e.severanceNet(in)
	wba := e.WeeklyBenefit(in)
	far := addDays(d.LastDay, 7*1000)
	uiWeeks := e.uiPaidWeeks(in, d.LastDay, far)
	cash := Dollars(in.Savings)
	sevAdded := false
	opt := RunwayOption{}
	expenses := Dollars(in.MonthlyExpenses)

	// FIX: pre-parse Earnings dates once before the hot loop to avoid
	// len(Earnings) × runwayHorizonWeeks repeated ParseDate calls.
	parsedEarnings := make([]earningEntry, 0, len(r.Earnings))
	for k, v := range r.Earnings {
		if t, err := ParseDate(k); err == nil {
			parsedEarnings = append(parsedEarnings, earningEntry{t, v})
		}
	}

	for i := 0; i < runwayHorizonWeeks; i++ {
		ws := addDays(r.Start, 7*i)
		we := addDays(ws, 7)
		if !sevAdded && d.SeverancePaid.Before(we) {
			cash += sevNet
			sevAdded = true
		}
		for _, u := range uiWeeks {
			if !u.Before(ws) && u.Before(we) {
				cash += wba
			}
		}
		for _, entry := range parsedEarnings {
			if !entry.date.Before(ws) && entry.date.Before(we) {
				cash += entry.amount
			}
		}
		monthly := expenses
		if ws.After(d.CoverageEnd) {
			monthly += r.Insurance(ws)
		}
		cash -= monthly.Mul(12.0 / 52.0)
		opt.Weeks = append(opt.Weeks, RunwayPoint{fmtDate(ws), cash.Whole()})
		if cash < 0 && opt.EndsOn == "" {
			opt.EndsOn = fmtDate(ws)
			break
		}
	}
	if opt.EndsOn == "" {
		opt.Beyond = true
		opt.Months = round1(float64(daysBetween(r.Current, addDays(r.Start, 7*runwayHorizonWeeks))) / 30.44)
		return opt
	}
	end, _ := ParseDate(opt.EndsOn)
	opt.Months = math.Max(0, round1(float64(daysBetween(r.Current, end))/30.44))
	return opt
}
