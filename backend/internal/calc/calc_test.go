package calc

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/yernurdev/sedona/backend/internal/data"
)

func engine(t *testing.T) *Engine {
	t.Helper()
	tb, err := data.Load("../../data")
	if err != nil {
		t.Fatal(err)
	}
	return New(tb)
}

func jessica(t *testing.T, e *Engine) (*CaseInput, *Dates, time.Time) {
	today := time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC)
	in := SampleCase(today)
	d, err := in.Validate(e.Supported)
	if err != nil {
		t.Fatal(err)
	}
	return &in, d, today
}

func TestJessicaReport(t *testing.T) {
	e := engine(t)
	in, d, today := jessica(t, e)
	r, err := e.Build(Context{Input: in, Dates: d, Now: today, Start: today})
	if err != nil {
		t.Fatal(err)
	}
	cobra := *r.Insurance.Options[0].Monthly
	if cobra != 2406 {
		t.Errorf("cobra monthly = %d, want 2406 (28303*1.02/12)", cobra)
	}
	aca := *r.Insurance.Options[1].Monthly
	if aca <= 0 || aca >= cobra {
		t.Errorf("aca monthly = %d, expected below COBRA", aca)
	}
	if r.Insurance.Cheapest != "aca" {
		t.Errorf("cheapest = %s", r.Insurance.Cheapest)
	}
	if r.Runway.ByOption["aca"].Months <= r.Runway.ByOption["cobra"].Months {
		t.Errorf("aca runway should exceed cobra runway")
	}
	if r.Unemployment.WeeklyBenefit != 577 {
		t.Errorf("TX weekly benefit = %d, want state max 577", r.Unemployment.WeeklyBenefit)
	}
	if n := NextDeadline(r.Deadlines); n == nil || n.ID != "ui_file" {
		t.Errorf("unexpected next deadline %+v", n)
	}
	b, _ := json.MarshalIndent(r.Insurance, "", " ")
	t.Logf("%s\nrunway: cobra %.1f aca %.1f", b, r.Runway.ByOption["cobra"].Months, r.Runway.ByOption["aca"].Months)
}

func TestSubsidyCliff(t *testing.T) {
	e := engine(t)
	in, d, _ := jessica(t, e)
	in.SpouseAnnualIncome = 200000
	q, err := e.ACAQuoteFor(in, d, 2027, IncomePlan{Reemployed: d.Reemployed, NewSalary: 92000})
	if err != nil {
		t.Fatal(err)
	}
	if q.Status != "over_cliff" || q.SubsidyMonthly != 0 {
		t.Errorf("expected no subsidy above 400%% FPL, got %+v", q)
	}
}

func TestMedicaidExpansionState(t *testing.T) {
	e := engine(t)
	in, _, _ := jessica(t, e)
	in.State = "MI"
	in.YTDWages, in.Severance.Gross, in.AnnualSalary = 0, 0, 20000
	d, err := in.Validate(e.Supported)
	if err != nil {
		t.Fatal(err)
	}
	q, err := e.ACAQuoteFor(in, d, 2027, IncomePlan{Reemployed: addDays(d.LastDay, 7000)})
	if err != nil {
		t.Fatal(err)
	}
	if q.Status != "medicaid_likely" {
		t.Errorf("status = %s, want medicaid_likely", q.Status)
	}
}

func TestCheckinCompliance(t *testing.T) {
	e := engine(t)
	in, _, _ := jessica(t, e)
	res, err := e.Checkin(in, CheckinInput{WeekStart: "2026-11-18", Activities: []Activity{
		{Date: "2026-11-16", Employer: "Acme", Position: "Marketing Manager", Method: "online"},
		{Date: "2026-11-17", Employer: "Globex", Position: "Brand Lead"},
		{Date: "2026-11-30", Employer: "Late Co"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if res.WeekStart != "2026-11-15" || res.Count != 2 || res.Compliant || res.Required != 3 {
		t.Errorf("unexpected checkin %+v", res)
	}
}

func TestMichiganUniqueActivities(t *testing.T) {
	e := engine(t)
	in, _, _ := jessica(t, e)
	in.State = "MI"
	res, _ := e.Checkin(in, CheckinInput{WeekStart: "2026-11-15", Activities: []Activity{
		{Date: "2026-11-16", Employer: "Acme", Position: "PM"},
		{Date: "2026-11-17", Employer: "acme", Position: "pm"},
	}})
	if res.Count != 1 {
		t.Errorf("duplicate activity counted: %d", res.Count)
	}
}

func TestOfferClawback(t *testing.T) {
	e := engine(t)
	in, d, _ := jessica(t, e)
	res, err := e.Offer(in, d, OfferInput{
		Company: "Globex", Salary: 95000, Match401kPct: 4, EmployeePremiumMonthly: 600, Deductible: 3000,
		StartDate: "2027-03-02", CoverageStartsAfterDays: 30,
		CurrentCoverage: CurrentCoverage{Type: "aca", MonthlyAPTC: 1500, APTCStartMonth: "2026-12"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.EffectiveAnnual != 95000+3800-7200-1500 {
		t.Errorf("effective annual = %d", res.EffectiveAnnual)
	}
	if res.APTCClawback == nil || res.APTCClawback.MonthsOnACA != 3 || res.APTCClawback.Excess <= 0 {
		t.Errorf("unexpected clawback %+v", res.APTCClawback)
	}
	t.Logf("clawback %+v", res.APTCClawback)
}

func TestCoverageIntoUnloadedYear(t *testing.T) {
	e := engine(t)
	in, _, today := jessica(t, e)
	in.CoverageEndDate = "2027-09-30"
	d, err := in.Validate(e.Supported)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.Build(Context{Input: in, Dates: d, Now: today, Start: today}); err != nil {
		t.Fatalf("report should fall back to nearest table year: %v", err)
	}
}
