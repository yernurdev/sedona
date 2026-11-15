package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/yernurdev/sedona/backend/internal/calc"
	"github.com/yernurdev/sedona/backend/internal/llm"
)

const llmCallsPerHour = 10

var askText = map[string]string{
	"extend_severance": "one additional month of severance pay",
	"cobra_subsidy":    "the company paying or subsidizing COBRA premiums for several months",
	"keep_bonus":       "payout of the bonus or commission earned this year",
	"extend_deadline":  "more time to review the separation agreement",
	"pto_payout":       "payout of unused PTO",
}

func (s *Server) generate(w http.ResponseWriter, r *http.Request, kind, prompt string) (string, bool) {
	if !s.LLM.Enabled() {
		writeErr(w, http.StatusServiceUnavailable, "llm_unavailable", llm.ErrNotConfigured.Error())
		return "", false
	}
	n, err := s.Store.RecordLLMCall(r.Context(), caseFrom(r).ID, kind)
	if err != nil {
		s.internal(w, r, err)
		return "", false
	}
	if n > llmCallsPerHour {
		writeErr(w, http.StatusTooManyRequests, "rate_limited", "You've reached 10 text requests this hour. Try again later.")
		return "", false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	text, err := s.LLM.Complete(ctx, prompt)
	if err != nil {
		s.Log.Error("llm", "kind", kind, "err", err)
		writeErr(w, http.StatusBadGateway, "llm_failed", "The text service didn't respond. Please retry.")
		return "", false
	}
	return text, true
}

func (s *Server) hrLetter(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Tone string   `json:"tone"`
		Asks []string `json:"asks"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if body.Tone != "polite" && body.Tone != "firm" {
		body.Tone = "polite"
	}
	var asks []string
	for _, a := range body.Asks {
		if t, ok := askText[a]; ok {
			asks = append(asks, "- "+t)
		}
	}
	if len(asks) == 0 {
		writeErr(w, http.StatusBadRequest, "invalid_input", "Pick at least one thing to ask for.")
		return
	}
	cc, rep, ok := s.report(w, r)
	if !ok {
		return
	}
	in := cc.Input
	sign := "not stated"
	if in.Severance.SignBy != "" {
		sign = in.Severance.SignBy
	}
	prompt := fmt.Sprintf(`Write an email from a laid-off employee to their former HR contact.
Tone: %s, professional, short (under 220 words). Use placeholders [HR name], [My name], [Company].
Facts computed by our calculator (use only these):
- Last day of work: %s
- Health coverage ends: %s
- Offered severance (gross): %s; agreement decision date: %s
- COBRA would cost about %s per month for this household
- Employee age: %d
Requests to make:
%s
Do not threaten legal action and do not state legal conclusions. Ask for written confirmation of the answers.
Return the subject line on the first line starting with "Subject: ", then a blank line, then the body.`,
		body.Tone, in.LastDay, in.CoverageEndDate, fmtMoney(rep.Severance.Gross), sign, fmtMoney(*optionMonthly(rep, "cobra")), in.Age, strings.Join(asks, "\n"))
	text, ok := s.generate(w, r, "hr_letter", prompt)
	if !ok {
		return
	}
	subject, letter := "Questions about my separation package", text
	if first, rest, found := strings.Cut(text, "\n"); found && strings.HasPrefix(first, "Subject:") {
		subject, letter = strings.TrimSpace(strings.TrimPrefix(first, "Subject:")), strings.TrimSpace(rest)
	}
	writeJSON(w, http.StatusOK, map[string]any{"subject": subject, "body": letter})
}

func (s *Server) explain(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Topic string `json:"topic"`
	}
	if err := decode(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	cc, rep, ok := s.report(w, r)
	if !ok {
		return
	}
	facts, err := explainFacts(body.Topic, cc, rep)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	prompt := "Explain these calculator results to the user in 4-6 short sentences, second person, plain English. Mention what they should verify and where.\n" + facts
	text, ok := s.generate(w, r, "explain_"+body.Topic, prompt)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"topic": body.Topic, "text": text})
}

func explainFacts(topic string, cc *caseCtx, rep *calc.Report) (string, error) {
	var aca calc.InsuranceOption
	for _, o := range rep.Insurance.Options {
		if o.Type == "aca" {
			aca = o
		}
	}
	switch topic {
	case "aca_subsidy":
		var b strings.Builder
		fmt.Fprintf(&b, "Topic: Marketplace (ACA) premium tax credit. State: %s. Household size: %d.\n", cc.Input.State, len(cc.Input.Household))
		for _, q := range aca.Quotes {
			fmt.Fprintf(&b, "Coverage year %d: projected income %s = %d%% of the %d poverty line (%s). Benchmark silver plan %s/mo, expected contribution %s/mo, tax credit %s/mo, net %s/mo. Status: %s.\n",
				q.Year, fmtMoney(q.MAGI), q.FPLPct, q.FPLYear, fmtMoney(q.FPL), fmtMoney(q.BenchmarkMonthly), fmtMoney(q.ContributionMonthly), fmtMoney(q.SubsidyMonthly), fmtMoney(q.NetMonthly), q.StatusNote)
		}
		b.WriteString("Rules: no subsidy above 400% of the poverty line since 2026; premiums are state averages, exact quotes at healthcare.gov.")
		return b.String(), nil
	case "cobra":
		return fmt.Sprintf("Topic: COBRA. Monthly cost %s (%s). Election deadline %s; election is retroactive to the day coverage ended; first premium due 45 days after election.",
			fmtMoney(*optionMonthly(rep, "cobra")), map[bool]string{true: "estimated as 102% of the average employer premium", false: "from the user's COBRA letter"}[rep.Insurance.Options[0].Estimate], rep.Insurance.Options[0].EnrollBy), nil
	case "runway":
		var b strings.Builder
		fmt.Fprintf(&b, "Topic: cash runway, assuming no new job. Savings %s, monthly expenses %s, severance net %s, unemployment %s/week for up to %d weeks.\n",
			fmtMoney(int64(cc.Input.Savings)), fmtMoney(int64(cc.Input.MonthlyExpenses)), fmtMoney(rep.Severance.NetEstimate), fmtMoney(rep.Unemployment.WeeklyBenefit), rep.Unemployment.MaxWeeks)
		for k, v := range rep.Runway.ByOption {
			fmt.Fprintf(&b, "With %s insurance: %.1f months.\n", k, v.Months)
		}
		return b.String(), nil
	case "clawback":
		return "Topic: repaying the advance premium tax credit. Since tax year 2026 there is no cap on repaying excess advance credit. If income rises after a new job and the Marketplace is not told within 30 days, the difference between credit received and credit allowed for the year's actual income is owed at tax time. Projected credit now: " + fmtMoney(aca.EnrollmentAPTCMonthly) + "/mo.", nil
	}
	return "", errors.New("topic must be aca_subsidy, cobra, runway or clawback")
}
