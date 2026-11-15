package calc

import (
	"sort"
	"time"
)

type Deadline struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	Date     string `json:"date"`
	DaysLeft int    `json:"daysLeft"`
	Source   string `json:"source"`
	Severity string `json:"severity"`
	Passed   bool   `json:"passed"`
}

func (e *Engine) CobraElectionDeadline(d *Dates) time.Time {
	from := d.CoverageEnd
	if d.CobraNotice != nil && d.CobraNotice.After(from) {
		from = *d.CobraNotice
	}
	return addDays(from, e.T.Deadlines.Rules["cobra_election"].Days)
}

// Deadlines derives every date from the user's inputs (spec 6.8).
func (e *Engine) Deadlines(in *CaseInput, d *Dates, now time.Time) []Deadline {
	rules := e.T.Deadlines.Rules
	var out []Deadline
	add := func(id string, date time.Time, title string) {
		r := rules[id]
		if title == "" {
			title = r.Title
		}
		out = append(out, Deadline{ID: id, Title: title, Detail: r.Detail, Date: fmtDate(date), Source: r.Source})
	}
	election := e.CobraElectionDeadline(d)
	add("cobra_election", election, "")
	add("cobra_first_payment", addDays(election, rules["cobra_first_payment"].Days), "First COBRA premium due (if you elect on the last day)")
	add("aca_sep", addDays(d.CoverageEnd, rules["aca_sep"].Days), "")
	if in.HasSpouse() {
		add("spouse_sep", addDays(d.CoverageEnd, rules["spouse_sep"].Days), "")
	}
	fileBy := addDays(d.LastDay, 1)
	if now.After(fileBy) {
		fileBy = now
	}
	add("ui_file", fileBy, "File your "+e.T.States[in.State].Name+" unemployment claim")
	if d.SignBy != nil {
		add("severance_sign", *d.SignBy, "")
	} else if in.Age >= 40 && in.Severance.Gross > 0 {
		days := 21
		if in.GroupLayoff {
			days = rules["owbpa_group"].Days
		}
		add("owbpa_group", addDays(d.LastDay, days), "Severance review period ends (age 40+)")
	}
	if in.Insurance.FSABalance > 0 {
		add("fsa_spend", d.CoverageEnd, "Spend your FSA balance ("+usd(Dollars(in.Insurance.FSABalance))+")")
	}
	if in.Has401kLoan {
		add("loan_401k", time.Date(d.LastDay.Year()+1, 10, 15, 0, 0, 0, 0, time.UTC), "")
	}
	for i := range out {
		t, _ := ParseDate(out[i].Date)
		out[i].DaysLeft = daysBetween(now, t)
		out[i].Passed = out[i].DaysLeft < 0
		switch {
		case out[i].Passed:
			out[i].Severity = "passed"
		case out[i].DaysLeft <= 7:
			out[i].Severity = "high"
		case out[i].DaysLeft <= 30:
			out[i].Severity = "medium"
		default:
			out[i].Severity = "low"
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out
}

func NextDeadline(ds []Deadline) *Deadline {
	for i := range ds {
		if !ds[i].Passed {
			return &ds[i]
		}
	}
	return nil
}
