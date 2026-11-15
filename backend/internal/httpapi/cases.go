package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"sort"
	"time"

	"github.com/yernurdev/sedona/backend/internal/calc"
	"github.com/yernurdev/sedona/backend/internal/store"
)

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "version": s.Version, "dataAsOf": s.Tables.Deadlines.AsOf})
}

var allStates = []struct{ Code, Name string }{
	{"AL", "Alabama"}, {"AK", "Alaska"}, {"AZ", "Arizona"}, {"AR", "Arkansas"}, {"CA", "California"}, {"CO", "Colorado"},
	{"CT", "Connecticut"}, {"DE", "Delaware"}, {"DC", "District of Columbia"}, {"FL", "Florida"}, {"GA", "Georgia"},
	{"HI", "Hawaii"}, {"ID", "Idaho"}, {"IL", "Illinois"}, {"IN", "Indiana"}, {"IA", "Iowa"}, {"KS", "Kansas"},
	{"KY", "Kentucky"}, {"LA", "Louisiana"}, {"ME", "Maine"}, {"MD", "Maryland"}, {"MA", "Massachusetts"},
	{"MI", "Michigan"}, {"MN", "Minnesota"}, {"MS", "Mississippi"}, {"MO", "Missouri"}, {"MT", "Montana"},
	{"NE", "Nebraska"}, {"NV", "Nevada"}, {"NH", "New Hampshire"}, {"NJ", "New Jersey"}, {"NM", "New Mexico"},
	{"NY", "New York"}, {"NC", "North Carolina"}, {"ND", "North Dakota"}, {"OH", "Ohio"}, {"OK", "Oklahoma"},
	{"OR", "Oregon"}, {"PA", "Pennsylvania"}, {"RI", "Rhode Island"}, {"SC", "South Carolina"}, {"SD", "South Dakota"},
	{"TN", "Tennessee"}, {"TX", "Texas"}, {"UT", "Utah"}, {"VT", "Vermont"}, {"VA", "Virginia"}, {"WA", "Washington"},
	{"WV", "West Virginia"}, {"WI", "Wisconsin"}, {"WY", "Wyoming"},
}

func (s *Server) metaStates(w http.ResponseWriter, r *http.Request) {
	type row struct {
		Code              string `json:"code"`
		Name              string `json:"name"`
		Supported         bool   `json:"supported"`
		WorkSearchPerWeek *int   `json:"workSearchPerWeek"`
		PortalURL         string `json:"portalUrl,omitempty"`
		Source            string `json:"source,omitempty"`
	}
	out := make([]row, 0, len(allStates))
	for _, st := range allStates {
		x := row{Code: st.Code, Name: st.Name}
		if d, ok := s.Tables.States[st.Code]; ok && d.Supported {
			n := d.WorkSearch.PerWeek
			x.Supported, x.WorkSearchPerWeek, x.PortalURL, x.Source = true, &n, d.PortalURL, d.WorkSearchSource
		}
		out = append(out, x)
	}
	writeJSON(w, http.StatusOK, map[string]any{"states": out})
}

func (s *Server) metaSources(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sources": s.Tables.Sources()})
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request) {
	sess, token, err := s.Store.CreateSession(r.Context())
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"sessionId": sess.ID, "token": token})
}

func (s *Server) getSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, sessionFrom(r))
}

func (s *Server) patchSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if _, err := mail.ParseAddress(body.Email); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_email", "Enter a valid email address.")
		return
	}
	sess := sessionFrom(r)
	if err := s.Store.SetEmail(r.Context(), sess.ID, body.Email); err != nil {
		s.internal(w, r, err)
		return
	}
	sess.Email = &body.Email
	writeJSON(w, http.StatusOK, sess)
}

func (s *Server) validateInput(w http.ResponseWriter, in *calc.CaseInput) bool {
	if _, err := in.Validate(s.Engine.Supported); err != nil {
		if errors.Is(err, calc.ErrUnsupportedState) {
			writeErr(w, http.StatusBadRequest, "unsupported_state", "We currently support Missouri, Texas, Michigan, California and Florida. Your state is coming soon.")
			return false
		}
		writeErr(w, http.StatusBadRequest, "invalid_input", err.Error())
		return false
	}
	return true
}

func (s *Server) createCase(w http.ResponseWriter, r *http.Request) {
	var in calc.CaseInput
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !s.validateInput(w, &in) {
		return
	}
	b, _ := json.Marshal(in)
	id, err := s.Store.CreateCase(r.Context(), sessionFrom(r).ID, string(b), false)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"caseId": id})
}

func (s *Server) createSample(w http.ResponseWriter, r *http.Request) {
	in := calc.SampleCase(calc.Today())
	b, _ := json.Marshal(in)
	id, err := s.Store.CreateCase(r.Context(), sessionFrom(r).ID, string(b), true)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"caseId": id})
}

// caseCtx is the parsed view of a stored case, ready for the calculation engine.
type caseCtx struct {
	calc.Context
	Case     store.Case
	Checkins []store.Checkin
}

func (s *Server) load(r *http.Request) (*caseCtx, error) {
	c := caseFrom(r)
	var in calc.CaseInput
	if err := json.Unmarshal([]byte(c.InputJSON), &in); err != nil {
		return nil, err
	}
	d, err := in.Validate(s.Engine.Supported)
	if err != nil {
		return nil, err
	}
	created := c.CreatedAt.UTC()
	start := time.Date(created.Year(), created.Month(), created.Day(), 0, 0, 0, 0, time.UTC)
	now := calc.Today().AddDate(0, 0, c.SimOffsetDays)
	cis, err := s.Store.ListCheckins(r.Context(), c.ID)
	if err != nil {
		return nil, err
	}
	earn := map[string]calc.Cents{}
	for _, ci := range cis {
		if ci.EarningsCents > 0 {
			earn[ci.WeekStart] = calc.Cents(ci.EarningsCents)
		}
	}
	return &caseCtx{Context: calc.Context{Input: &in, Dates: d, Now: now, Start: start, Earnings: earn}, Case: c, Checkins: cis}, nil
}

func (s *Server) getCase(w http.ResponseWriter, r *http.Request) {
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	st := s.Tables.States[cc.Input.State]
	writeJSON(w, http.StatusOK, map[string]any{
		"caseId": cc.Case.ID, "input": cc.Input, "isSample": cc.Case.IsSample, "paid": cc.Case.Paid,
		"currentDate": cc.Now.Format("2006-01-02"), "simOffsetDays": cc.Case.SimOffsetDays,
		"state": map[string]any{"code": st.Code, "name": st.Name, "workSearchPerWeek": st.WorkSearch.PerWeek, "certification": st.Certification.Label, "portalUrl": st.PortalURL},
	})
}

func (s *Server) patchCase(w http.ResponseWriter, r *http.Request) {
	c := caseFrom(r)
	merged := map[string]any{}
	if err := json.Unmarshal([]byte(c.InputJSON), &merged); err != nil {
		s.internal(w, r, err)
		return
	}
	var patch map[string]any
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	mergeInto(merged, patch)
	b, _ := json.Marshal(merged)
	var in calc.CaseInput
	if err := json.Unmarshal(b, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	if !s.validateInput(w, &in) {
		return
	}
	b, _ = json.Marshal(in)
	if err := s.Store.UpdateCaseInput(r.Context(), c.ID, string(b)); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"caseId": c.ID, "input": in})
}

func mergeInto(dst, src map[string]any) {
	for k, v := range src {
		if sub, ok := v.(map[string]any); ok {
			if d, ok := dst[k].(map[string]any); ok {
				mergeInto(d, sub)
				continue
			}
		}
		dst[k] = v
	}
}

func (s *Server) report(w http.ResponseWriter, r *http.Request) (*caseCtx, *calc.Report, bool) {
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return nil, nil, false
	}
	rep, err := s.Engine.Build(cc.Context)
	if err != nil {
		s.internal(w, r, err)
		return nil, nil, false
	}
	return cc, rep, true
}

func (s *Server) summary(w http.ResponseWriter, r *http.Request) {
	cc, rep, ok := s.report(w, r)
	if !ok {
		return
	}
	cheapestMonthly := optionMonthly(rep, rep.Insurance.Cheapest)
	var acaQuote any
	for _, o := range rep.Insurance.Options {
		if o.Type == "aca" && len(o.Quotes) > 0 {
			q := o.Quotes[len(o.Quotes)-1]
			acaQuote = map[string]any{"year": q.Year, "magi": q.MAGI, "fplPct": q.FPLPct, "status": q.Status, "statusNote": q.StatusNote, "benchmarkMonthly": q.BenchmarkMonthly, "subsidyMonthly": q.SubsidyMonthly}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"caseId": cc.Case.ID, "isSample": cc.Case.IsSample, "paid": cc.Case.Paid, "currentDate": rep.CurrentDate,
		"insurance": map[string]any{
			"cobraMonthly": optionMonthly(rep, "cobra"), "acaMonthly": optionMonthly(rep, "aca"), "spouseMonthly": optionMonthly(rep, "spouse"),
			"cheapest": rep.Insurance.Cheapest, "cheapestMonthly": cheapestMonthly, "estimate": true, "why": rep.Insurance.Why, "aca": acaQuote,
		},
		"runway": map[string]any{
			"months": rep.Runway.Months, "basis": rep.Runway.Basis,
			"byOption": map[string]any{"cobra": runwayMonths(rep, "cobra"), "aca": runwayMonths(rep, "aca"), "spouse": runwayMonths(rep, "spouse")},
		},
		"nextDeadline":   calc.NextDeadline(rep.Deadlines),
		"deadlineCount":  len(rep.Deadlines),
		"lockedSections": []string{"fullPlan", "deadlines", "weeklyCheckin", "offer", "tax", "hrLetter"},
		"disclaimer":     rep.Disclaimer,
	})
}

func (s *Server) plan(w http.ResponseWriter, r *http.Request) {
	cc, rep, ok := s.report(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"caseId": cc.Case.ID, "isSample": cc.Case.IsSample, "currentDate": rep.CurrentDate,
		"insurance": rep.Insurance, "runway": rep.Runway, "unemployment": rep.Unemployment,
		"severance": rep.Severance, "deadlines": rep.Deadlines, "actions": rep.Actions,
		"calendarUrl": "/api/cases/" + cc.Case.ID + "/calendar.ics",
		"disclaimer":  rep.Disclaimer,
	})
}

func optionMonthly(rep *calc.Report, typ string) *int64 {
	for _, o := range rep.Insurance.Options {
		if o.Type == typ {
			return o.Monthly
		}
	}
	return nil
}

func runwayMonths(rep *calc.Report, typ string) *float64 {
	if r, ok := rep.Runway.ByOption[typ]; ok {
		return &r.Months
	}
	return nil
}

func sortedWeeks(cis []store.Checkin) []store.Checkin {
	sort.Slice(cis, func(i, j int) bool { return cis[i].WeekStart > cis[j].WeekStart })
	return cis
}
