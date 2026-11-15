package calc

import "time"

const acaAverageMonths = 6

const Disclaimer = "Educational calculations, not legal, tax or insurance advice. Verify with official sources."

type Context struct {
	Input    *CaseInput
	Dates    *Dates
	Now      time.Time
	Start    time.Time
	Earnings map[string]Cents
}

type InsuranceOption struct {
	Type                  string     `json:"type"`
	Label                 string     `json:"label"`
	Monthly               *int64     `json:"monthly"`
	Annual                *int64     `json:"annual"`
	Notes                 []string   `json:"notes"`
	Source                string     `json:"source,omitempty"`
	Estimate              bool       `json:"estimate"`
	EnrollBy              string     `json:"enrollBy,omitempty"`
	Quotes                []ACAQuote `json:"quotes,omitempty"`
	EnrollmentAPTCMonthly int64      `json:"enrollmentAptcMonthly,omitempty"`
}

type InsuranceReport struct {
	Options  []InsuranceOption `json:"options"`
	Cheapest string            `json:"cheapest"`
	Why      string            `json:"why"`
	Estimate bool              `json:"estimate"`
}

type RunwayReport struct {
	Months   float64                  `json:"months"`
	Basis    string                   `json:"basis"`
	ByOption map[string]*RunwayOption `json:"byOption"`
}

type Actions struct {
	Today     []string `json:"today"`
	ThisWeek  []string `json:"thisWeek"`
	ThisMonth []string `json:"thisMonth"`
}

type Report struct {
	CurrentDate  string          `json:"currentDate"`
	Insurance    InsuranceReport `json:"insurance"`
	Runway       RunwayReport    `json:"runway"`
	Unemployment Unemployment    `json:"unemployment"`
	Severance    SeveranceResult `json:"severance"`
	Deadlines    []Deadline      `json:"deadlines"`
	Actions      Actions         `json:"actions"`
	Disclaimer   string          `json:"disclaimer"`
}

func i64(c Cents) *int64 { v := c.Whole(); return &v }

func (e *Engine) Build(c Context) (*Report, error) {
	in, d := c.Input, c.Dates
	rules := e.T.Deadlines.Rules
	plan := IncomePlan{Reemployed: d.Reemployed, NewSalary: in.ExpectedReemployment.Salary}

	cobra, cobraEst := e.CobraMonthly(in)
	election := e.CobraElectionDeadline(d)
	cobraOpt := InsuranceOption{
		Type: "cobra", Label: "COBRA (keep your plan)", Monthly: i64(cobra), Annual: i64(cobra * 12),
		Estimate: cobraEst, Source: e.T.Cobra.Source, EnrollBy: fmtDate(election),
		Notes: []string{
			"Retroactive election: you have until " + fmtDate(election) + " to elect, and coverage reaches back to the day your plan ended.",
			"First premium is due 45 days after you elect.",
		},
	}
	if cobraEst {
		cobraOpt.Notes = append([]string{"Estimated as 102% of the average employer premium (KFF 2026). Enter the amount from your COBRA letter for an exact figure."}, cobraOpt.Notes...)
	}

	quotes, acaAvg, err := e.ACAOverMonths(in, d, acaAverageMonths, plan)
	if err != nil {
		return nil, err
	}
	noJob := IncomePlan{Reemployed: addDays(d.LastDay, 7*1000)}
	lastQ := quotes[len(quotes)-1]
	enrollQ, err := e.ACAQuoteFor(in, d, lastQ.Year, noJob)
	if err != nil {
		return nil, err
	}
	enrollAPTC := enrollQ.SubsidyMonthly
	if enrollQ.Status != "subsidy" {
		enrollAPTC = lastQ.SubsidyMonthly
	}
	acaOpt := InsuranceOption{
		Type: "aca", Label: "Marketplace (ACA) benchmark silver", Monthly: i64(acaAvg), Annual: i64(acaAvg * 12),
		Estimate: true, Source: "https://www.healthcare.gov/see-plans/", Quotes: quotes,
		EnrollBy:              fmtDate(addDays(d.CoverageEnd, rules["aca_sep"].Days)),
		EnrollmentAPTCMonthly: enrollAPTC,
		Notes: []string{
			"Average of the next " + itoa(acaAverageMonths) + " months; the tax credit is based on projected income for each calendar year.",
			"State average premium, not a ZIP-level quote. Get an exact quote at healthcare.gov.",
		},
	}
	byYear := e.acaMonthlyByYear(quotes)

	opts := []InsuranceOption{cobraOpt, acaOpt}
	spouse := e.SpouseMonthly(in)
	spouseOpt := InsuranceOption{Type: "spouse", Label: "Spouse's employer plan"}
	if in.HasSpouse() {
		spouseOpt.EnrollBy = fmtDate(addDays(d.CoverageEnd, rules["spouse_sep"].Days))
		spouseOpt.Source = rules["spouse_sep"].Source
		spouseOpt.Notes = []string{"Losing your coverage lets you join your spouse's plan mid-year. Enroll within 30 days (by " + spouseOpt.EnrollBy + ")."}
		if spouse != nil {
			spouseOpt.Monthly, spouseOpt.Annual = i64(*spouse), i64(*spouse*12)
		} else {
			spouseOpt.Notes = append(spouseOpt.Notes, "Ask your spouse's HR what adding you (and kids) costs per month, then add it to compare.")
		}
	} else {
		spouseOpt.Notes = []string{"Not applicable: no spouse in your household."}
	}
	opts = append(opts, spouseOpt)

	cheapest := "cobra"
	best := cobra
	if acaAvg < best {
		cheapest, best = "aca", acaAvg
	}
	if spouse != nil && *spouse < best {
		cheapest = "spouse"
	}

	insFor := map[string]func(time.Time) Cents{
		"cobra": func(time.Time) Cents { return cobra },
		"aca": func(t time.Time) Cents {
			if v, ok := byYear[t.Year()]; ok {
				return v
			}
			return Dollars(float64(lastQ.NetMonthly))
		},
	}
	if spouse != nil {
		s := *spouse
		insFor["spouse"] = func(time.Time) Cents { return s }
	}
	by := map[string]*RunwayOption{}
	for k, f := range insFor {
		r := e.Runway(in, d, RunwayInput{Start: c.Start, Current: c.Now, Earnings: c.Earnings, Insurance: f})
		r.Type = k
		r.Monthly = f(c.Now).Whole()
		by[k] = &r
	}

	deadlines := e.Deadlines(in, d, c.Now)
	rep := &Report{
		CurrentDate: fmtDate(c.Now),
		Insurance: InsuranceReport{
			Options: opts, Cheapest: cheapest, Estimate: true,
			Why: "Marketplace subsidies are based on your projected income for the whole calendar year, which drops after a layoff. COBRA is the full employer premium plus 2%.",
		},
		Runway:       RunwayReport{Months: by[cheapest].Months, Basis: cheapest, ByOption: by},
		Unemployment: e.Unemployment(in),
		Severance:    e.Severance(in),
		Deadlines:    deadlines,
		Disclaimer:   Disclaimer,
	}
	rep.Actions = e.actions(in, d, deadlines)
	return rep, nil
}

func (e *Engine) actions(in *CaseInput, d *Dates, ds []Deadline) Actions {
	st := e.T.States[in.State]
	a := Actions{Today: []string{}, ThisWeek: []string{}, ThisMonth: []string{}}
	a.Today = append(a.Today, "File your unemployment claim at "+st.PortalURL+".")
	if d.CobraNotice == nil {
		a.Today = append(a.Today, "Ask HR when your COBRA election notice will be sent and the exact date your coverage ends.")
	}
	for _, dl := range ds {
		if dl.Passed || dl.ID == "ui_file" {
			continue
		}
		item := dl.Title + " — by " + dl.Date + " (" + itoa(int64(dl.DaysLeft)) + " days)"
		switch {
		case dl.DaysLeft <= 2:
			a.Today = append(a.Today, item)
		case dl.DaysLeft <= 7:
			a.ThisWeek = append(a.ThisWeek, item)
		case dl.DaysLeft <= 31:
			a.ThisMonth = append(a.ThisMonth, item)
		}
	}
	a.ThisWeek = append(a.ThisWeek, "Get an exact Marketplace quote at healthcare.gov using the income projection from this plan.")
	if st.WorkSearch.PerWeek > 0 {
		a.ThisWeek = append(a.ThisWeek, "Log "+itoa(int64(st.WorkSearch.PerWeek))+" work search activities for this benefit week.")
	} else {
		a.ThisWeek = append(a.ThisWeek, "Keep a record of your work search activities for this benefit week.")
	}
	if in.Severance.Gross > 0 {
		a.ThisWeek = append(a.ThisWeek, "Send your questions to HR before signing the severance agreement.")
	}
	a.ThisMonth = append(a.ThisMonth, "Add the deadline calendar so weekly certification reminders land in your calendar.")
	return a
}
