package calc

import (
	"encoding/csv"
	"errors"
	"strings"
	"time"
)

type Activity struct {
	Date     string `json:"date"`
	Employer string `json:"employer"`
	Position string `json:"position"`
	Method   string `json:"method"`
	Contact  string `json:"contact"`
	Result   string `json:"result"`
}

type CheckinInput struct {
	WeekStart  string     `json:"weekStart"`
	Activities []Activity `json:"activities"`
	Earnings   float64    `json:"earnings"`
}

type CheckinResult struct {
	WeekStart             string     `json:"weekStart"`
	Required              int        `json:"required"`
	Count                 int        `json:"count"`
	Compliant             bool       `json:"compliant"`
	Rule                  string     `json:"rule"`
	Record                string     `json:"record"`
	Issues                []string   `json:"issues"`
	Activities            []Activity `json:"activities"`
	Earnings              int64      `json:"earnings"`
	EarningsReminder      string     `json:"earningsReminder,omitempty"`
	NextCertificationDate string     `json:"nextCertificationDate"`
	PortalURL             string     `json:"portalUrl"`
}

// WeekStartOf returns the Sunday that starts the benefit week containing t.
func WeekStartOf(t time.Time) time.Time { return addDays(t, -int(t.Weekday())) }

func NormalizeWeek(s string) (string, error) {
	t, err := ParseDate(s)
	if err != nil {
		return "", errors.New("weekStart must be YYYY-MM-DD")
	}
	return fmtDate(WeekStartOf(t)), nil
}

func (e *Engine) Checkin(in *CaseInput, c CheckinInput) (CheckinResult, error) {
	st := e.T.States[in.State]
	ws, err := ParseDate(c.WeekStart)
	if err != nil {
		return CheckinResult{}, errors.New("weekStart must be YYYY-MM-DD")
	}
	ws = WeekStartOf(ws)
	we := addDays(ws, 7)
	res := CheckinResult{
		WeekStart: fmtDate(ws), Required: st.WorkSearch.PerWeek, Rule: st.WorkSearch.Rule,
		Activities: []Activity{}, Issues: []string{}, Earnings: Dollars(c.Earnings).Whole(),
		NextCertificationDate: fmtDate(we), PortalURL: st.PortalURL,
	}
	seen := map[string]bool{}
	var lines []string
	for _, a := range c.Activities {
		a.Employer, a.Position, a.Contact = strings.TrimSpace(a.Employer), strings.TrimSpace(a.Position), strings.TrimSpace(a.Contact)
		t, err := ParseDate(a.Date)
		if err != nil || a.Employer == "" {
			res.Issues = append(res.Issues, "Skipped an activity without a valid date or employer.")
			continue
		}
		if t.Before(ws) || !t.Before(we) {
			res.Issues = append(res.Issues, a.Employer+": date "+a.Date+" is outside this benefit week.")
			continue
		}
		key := strings.ToLower(a.Employer + "|" + a.Position)
		if st.WorkSearch.Unique && seen[key] {
			res.Issues = append(res.Issues, a.Employer+": duplicate activity does not count ("+st.Name+" requires unique activities).")
			continue
		}
		seen[key] = true
		res.Activities = append(res.Activities, a)
		lines = append(lines, strings.Join([]string{t.Format("01/02/2006"), a.Employer, orDash(a.Position), orDash(a.Method), orDash(a.Contact), orDash(a.Result)}, " | "))
	}
	res.Count = len(res.Activities)
	res.Compliant = res.Count > 0 && res.Count >= res.Required
	if !res.Compliant {
		need := res.Required - res.Count
		if need < 1 {
			need = 1
		}
		res.Issues = append(res.Issues, "Add "+itoa(int64(need))+" more activit"+plural(need, "y", "ies")+" before you certify.")
	}
	header := "Work search log, week of " + ws.Format("01/02/2006") + " - " + addDays(we, -1).Format("01/02/2006") + "\nDate | Employer | Position | Method | Contact | Result"
	res.Record = header + "\n" + strings.Join(lines, "\n")
	if c.Earnings > 0 {
		res.EarningsReminder = "You earned " + usd(Dollars(c.Earnings)) + " this week. Report gross earnings when you certify; your benefit may be reduced for this week."
	}
	return res, nil
}

func RecordCSV(acts []Activity) (string, error) {
	var b strings.Builder
	w := csv.NewWriter(&b)
	_ = w.Write([]string{"date", "employer", "position", "method", "contact", "result"})
	for _, a := range acts {
		if err := w.Write([]string{a.Date, a.Employer, a.Position, a.Method, a.Contact, a.Result}); err != nil {
			return "", err
		}
	}
	w.Flush()
	return b.String(), w.Error()
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
