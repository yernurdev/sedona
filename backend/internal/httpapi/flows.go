package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/yernurdev/sedona/backend/internal/calc"
	"github.com/yernurdev/sedona/backend/internal/ics"
	"github.com/yernurdev/sedona/backend/internal/store"
)

func (s *Server) runwayFor(cc *caseCtx) (*calc.Report, error) {
	return s.Engine.Build(cc.Context)
}

func (s *Server) postCheckin(w http.ResponseWriter, r *http.Request) {
	var body calc.CheckinInput
	if err := decode(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if body.Earnings < 0 || body.Earnings > 1_000_000 || len(body.Activities) > 30 {
		writeErr(w, http.StatusBadRequest, "invalid_input", "Earnings must be 0 or more and at most 30 activities per week.")
		return
	}
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	res, err := s.Engine.Checkin(cc.Input, body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	acts, _ := json.Marshal(res.Activities)
	if err := s.Store.UpsertCheckin(r.Context(), cc.Case.ID, store.Checkin{WeekStart: res.WeekStart, ActivitiesJSON: string(acts), EarningsCents: int64(calc.Dollars(body.Earnings))}); err != nil {
		s.internal(w, r, err)
		return
	}
	cc, err = s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	rep, err := s.runwayFor(cc)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"checkin": res, "runway": map[string]any{"months": rep.Runway.Months, "basis": rep.Runway.Basis}})
}

func (s *Server) listCheckins(w http.ResponseWriter, r *http.Request) {
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	st := s.Tables.States[cc.Input.State]
	type row struct {
		WeekStart       string `json:"weekStart"`
		ActivitiesCount int    `json:"activitiesCount"`
		Required        int    `json:"required"`
		Compliant       bool   `json:"compliant"`
		Earnings        int64  `json:"earnings"`
	}
	rows := []row{}
	for _, ci := range sortedWeeks(cc.Checkins) {
		var acts []calc.Activity
		_ = json.Unmarshal([]byte(ci.ActivitiesJSON), &acts)
		rows = append(rows, row{ci.WeekStart, len(acts), st.WorkSearch.PerWeek, len(acts) > 0 && len(acts) >= st.WorkSearch.PerWeek, calc.Cents(ci.EarningsCents).Whole()})
	}
	rep, err := s.runwayFor(cc)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"weeks": rows, "currentWeek": calc.WeekStartOf(cc.Now).Format("2006-01-02"), "currentDate": cc.Now.Format("2006-01-02"),
		"rule": st.WorkSearch.Rule, "required": st.WorkSearch.PerWeek, "certification": st.Certification.Label, "portalUrl": st.PortalURL,
		"runway": map[string]any{"months": rep.Runway.Months, "basis": rep.Runway.Basis, "weeks": rep.Runway.ByOption[rep.Runway.Basis].Weeks},
	})
}

func (s *Server) checkinResult(w http.ResponseWriter, r *http.Request) (*calc.CheckinResult, bool) {
	week, err := calc.NormalizeWeek(r.PathValue("week"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_input", err.Error())
		return nil, false
	}
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return nil, false
	}
	ci, err := s.Store.GetCheckin(r.Context(), cc.Case.ID, week)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "not_found", "No check-in for this week yet.")
		return nil, false
	}
	if err != nil {
		s.internal(w, r, err)
		return nil, false
	}
	var acts []calc.Activity
	_ = json.Unmarshal([]byte(ci.ActivitiesJSON), &acts)
	res, err := s.Engine.Checkin(cc.Input, calc.CheckinInput{WeekStart: week, Activities: acts, Earnings: float64(ci.EarningsCents) / 100})
	if err != nil {
		s.internal(w, r, err)
		return nil, false
	}
	return &res, true
}

func (s *Server) getCheckin(w http.ResponseWriter, r *http.Request) {
	if res, ok := s.checkinResult(w, r); ok {
		writeJSON(w, http.StatusOK, res)
	}
}

func (s *Server) checkinCSV(w http.ResponseWriter, r *http.Request) {
	res, ok := s.checkinResult(w, r)
	if !ok {
		return
	}
	out, err := calc.RecordCSV(res.Activities)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="work-search-`+res.WeekStart+`.csv"`)
	_, _ = w.Write([]byte(out))
}

type offerOut struct {
	ID        string           `json:"id"`
	Input     calc.OfferInput  `json:"input"`
	Result    calc.OfferResult `json:"result"`
	CreatedAt string           `json:"createdAt"`
}

func (s *Server) evalOffers(cc *caseCtx, offers []store.Offer) ([]offerOut, error) {
	out := []offerOut{}
	for _, o := range offers {
		var in calc.OfferInput
		if err := json.Unmarshal([]byte(o.InputJSON), &in); err != nil {
			return nil, err
		}
		res, err := s.Engine.Offer(cc.Input, cc.Dates, in)
		if err != nil {
			return nil, err
		}
		out = append(out, offerOut{o.ID, in, res, o.CreatedAt})
	}
	return out, nil
}

func (s *Server) postOffer(w http.ResponseWriter, r *http.Request) {
	var in calc.OfferInput
	if err := decode(r, &in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	res, err := s.Engine.Offer(cc.Input, cc.Dates, in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	existing, err := s.Store.ListOffers(r.Context(), cc.Case.ID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	if len(existing) >= 3 {
		writeErr(w, http.StatusConflict, "too_many_offers", "You can compare up to 3 offers. Remove one first.")
		return
	}
	b, _ := json.Marshal(in)
	id, err := s.Store.CreateOffer(r.Context(), cc.Case.ID, string(b))
	if err != nil {
		s.internal(w, r, err)
		return
	}
	var compareTo any
	if prev, err := s.evalOffers(cc, existing); err == nil && len(prev) > 0 {
		best := prev[0]
		for _, p := range prev[1:] {
			if p.Result.EffectiveAnnual > best.Result.EffectiveAnnual {
				best = p
			}
		}
		compareTo = map[string]any{"offerId": best.ID, "company": best.Input.Company, "effectiveAnnual": best.Result.EffectiveAnnual, "difference": res.EffectiveAnnual - best.Result.EffectiveAnnual}
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "result": res, "compareTo": compareTo})
}

func (s *Server) listOffers(w http.ResponseWriter, r *http.Request) {
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	offers, err := s.Store.ListOffers(r.Context(), cc.Case.ID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	out, err := s.evalOffers(cc, offers)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"offers": out})
}

func (s *Server) deleteOffer(w http.ResponseWriter, r *http.Request) {
	err := s.Store.DeleteOffer(r.Context(), caseFrom(r).ID, r.PathValue("offerId"))
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "not_found", "Offer not found.")
		return
	}
	if err != nil {
		s.internal(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) taxPreview(w http.ResponseWriter, r *http.Request) {
	cc, err := s.load(r)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	offers, err := s.Store.ListOffers(r.Context(), cc.Case.ID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	evald, err := s.evalOffers(cc, offers)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	var cb *calc.Clawback
	for _, o := range evald {
		if o.Result.APTCClawback != nil && (cb == nil || o.Result.APTCClawback.Excess > cb.Excess) {
			cb = o.Result.APTCClawback
		}
	}
	withhold := r.URL.Query().Get("uiWithholding") == "1"
	writeJSON(w, http.StatusOK, s.Engine.TaxPreview(cc.Input, cc.Dates, withhold, cb))
}

func (s *Server) demoAdvance(w http.ResponseWriter, r *http.Request) {
	c := caseFrom(r)
	if !c.IsSample {
		writeErr(w, http.StatusForbidden, "forbidden", "Time travel is only available on the sample case.")
		return
	}
	var body struct {
		Weeks int `json:"weeks"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if body.Weeks < 1 || body.Weeks > 12 {
		writeErr(w, http.StatusBadRequest, "invalid_input", "weeks must be 1 to 12")
		return
	}
	if c.SimOffsetDays+7*body.Weeks > 7*52 {
		writeErr(w, http.StatusBadRequest, "invalid_input", "The demo can move forward up to one year.")
		return
	}
	if err := s.Store.AdvanceDays(r.Context(), c.ID, 7*body.Weeks); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"currentDate": calc.Today().AddDate(0, 0, c.SimOffsetDays+7*body.Weeks).Format("2006-01-02")})
}

func (s *Server) demoUnlock(w http.ResponseWriter, r *http.Request) {
	c := caseFrom(r)
	if !c.IsSample {
		writeErr(w, http.StatusForbidden, "forbidden", "Only the sample case can be unlocked without payment.")
		return
	}
	if err := s.Store.SetPaid(r.Context(), c.ID, true); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"paid": true})
}

func (s *Server) calendar(w http.ResponseWriter, r *http.Request) {
	sess, err := s.Store.SessionByToken(r.Context(), r.URL.Query().Get("token"))
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "unauthorized", "Invalid calendar link.")
		return
	}
	c, err := s.Store.GetCase(r.Context(), r.PathValue("id"))
	if err != nil || c.SessionID != sess.ID {
		writeErr(w, http.StatusNotFound, "not_found", "Case not found.")
		return
	}
	if !c.Paid {
		writeErr(w, http.StatusPaymentRequired, "payment_required", "Unlock the full plan to export the calendar.")
		return
	}
	ctx := r.Context()
	ctx = withValues(ctx, sess, c)
	r = r.WithContext(ctx)
	cc, rep, ok := s.report(w, r)
	if !ok {
		return
	}
	var events []ics.Event
	for _, d := range rep.Deadlines {
		if d.Passed {
			continue
		}
		t, _ := calc.ParseDate(d.Date)
		events = append(events, ics.Event{UID: c.ID + "-" + d.ID + "@sedona", Date: t, Summary: d.Title, Description: d.Detail + "\nSource: " + d.Source, URL: d.Source, AlarmDays: 3})
	}
	st := s.Tables.States[cc.Input.State]
	every := st.Certification.EveryDays / 7
	if every < 1 {
		every = 1
	}
	first := calc.WeekStartOf(cc.Now).AddDate(0, 0, 7)
	desc := st.Certification.Label + ". " + st.WorkSearch.Rule + " Log your activities in Sedona to get a ready-to-paste record."
	weekly := &ics.Weekly{
		UID: c.ID + "-weekly@sedona", Start: first, IntervalWk: every, Count: (st.Benefit.MaxWeeks + every - 1) / every,
		Summary: "File your " + st.Name + " unemployment request + work search", Description: desc, URL: st.PortalURL,
	}
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="sedona-deadlines.ics"`)
	_, _ = w.Write([]byte(ics.Build("Sedona: layoff money deadlines", events, weekly)))
}

func (s *Server) billingPlans(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"plans":         []map[string]any{{"id": "transition", "firstMonth": 39, "thenMonthly": 14.99, "currency": "usd"}},
		"testCard":      "4242 4242 4242 4242",
		"stripeEnabled": s.Billing.Enabled(),
	})
}

func (s *Server) checkout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CaseID string `json:"caseId"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	c, err := s.Store.GetCase(r.Context(), body.CaseID)
	if err != nil || c.SessionID != sessionFrom(r).ID {
		writeErr(w, http.StatusNotFound, "not_found", "Case not found.")
		return
	}
	if c.Paid {
		writeErr(w, http.StatusConflict, "already_paid", "This plan is already unlocked.")
		return
	}
	id, url, err := s.Billing.Checkout(c.ID)
	if err != nil {
		s.Log.Error("checkout", "err", err)
		writeErr(w, http.StatusServiceUnavailable, "payments_unavailable", "Payments are temporarily unavailable. Please try again.")
		return
	}
	if err := s.Store.CreatePayment(r.Context(), c.ID, id); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": url})
}

func (s *Server) webhook(w http.ResponseWriter, r *http.Request) {
	payload, err := readAll(r, 1<<16)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "unreadable body")
		return
	}
	ev, err := s.Billing.ParseWebhook(payload, r.Header.Get("Stripe-Signature"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_signature", "invalid webhook")
		return
	}
	switch ev.Type {
	case "checkout.session.completed":
		caseID, err := s.Store.UpdatePayment(r.Context(), ev.SessionID, ev.SubscriptionID, "complete")
		if err == nil && ev.Paid {
			err = s.Store.SetPaid(r.Context(), caseID, true)
		}
		if err != nil && !errors.Is(err, store.ErrNotFound) {
			s.internal(w, r, err)
			return
		}
	case "customer.subscription.deleted":
		if caseID, err := s.Store.CaseBySubscription(r.Context(), ev.SubscriptionID); err == nil {
			_ = s.Store.SetPaid(r.Context(), caseID, false)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"received": true})
}

// billingStatus also confirms payment with Stripe directly, so the plan unlocks
// right after redirect even if the webhook has not arrived yet.
func (s *Server) billingStatus(w http.ResponseWriter, r *http.Request) {
	c := caseFrom(r)
	status := "none"
	if c.Paid {
		status = "active"
	}
	if !c.Paid {
		if p, err := s.Store.LatestPayment(r.Context(), c.ID); err == nil && s.Billing.Enabled() {
			if st, err := s.Billing.SessionStatus(p.StripeSessionID); err == nil {
				status = st.Status
				if st.Paid {
					_, _ = s.Store.UpdatePayment(r.Context(), p.StripeSessionID, st.SubscriptionID, "complete")
					if err := s.Store.SetPaid(r.Context(), c.ID, true); err != nil {
						s.internal(w, r, err)
						return
					}
					c.Paid, status = true, "active"
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"paid": c.Paid, "subscriptionStatus": status})
}

func fmtMoney(n int64) string {
	s := fmt.Sprintf("%d", n)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}
	return "$" + b.String()
}

// testCheckout is the built-in test-mode checkout used when no Stripe account is
// configured: it accepts only the public test card and never charges anything.
func (s *Server) testCheckout(w http.ResponseWriter, r *http.Request) {
	if s.Billing.Enabled() {
		writeErr(w, http.StatusConflict, "use_stripe", "This server uses Stripe Checkout.")
		return
	}
	var body struct {
		CaseID string `json:"caseId"`
		Card   string `json:"card"`
		Expiry string `json:"expiry"`
		CVC    string `json:"cvc"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	c, err := s.Store.GetCase(r.Context(), body.CaseID)
	if err != nil || c.SessionID != sessionFrom(r).ID {
		writeErr(w, http.StatusNotFound, "not_found", "Case not found.")
		return
	}
	card := strings.NewReplacer(" ", "", "-", "").Replace(body.Card)
	if card != "4242424242424242" {
		writeErr(w, http.StatusPaymentRequired, "card_declined", "Test mode: only the test card 4242 4242 4242 4242 is accepted. No real cards.")
		return
	}
	if !validExpiry(body.Expiry) || len(strings.TrimSpace(body.CVC)) < 3 {
		writeErr(w, http.StatusBadRequest, "invalid_card", "Enter any future expiry (MM/YY) and any 3-digit CVC.")
		return
	}
	if err := s.Store.CreatePayment(r.Context(), c.ID, "test_"+c.ID+"_"+fmt.Sprint(time.Now().Unix())); err != nil {
		s.internal(w, r, err)
		return
	}
	if err := s.Store.SetPaid(r.Context(), c.ID, true); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"paid": true, "charged": 39, "currency": "usd", "testMode": true})
}

func validExpiry(s string) bool {
	t, err := time.Parse("01/06", strings.ReplaceAll(strings.TrimSpace(s), " ", ""))
	if err != nil {
		return false
	}
	return !t.AddDate(0, 1, 0).Before(time.Now())
}
