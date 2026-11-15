package calc

type SeveranceResult struct {
	Gross           int64    `json:"gross"`
	FederalWithheld int64    `json:"federalWithheld"`
	FICA            int64    `json:"fica"`
	StateWithheld   int64    `json:"stateWithheld"`
	NetEstimate     int64    `json:"netEstimate"`
	SignBy          string   `json:"signBy,omitempty"`
	PaidOn          string   `json:"paidOn,omitempty"`
	QuestionsForHR  []string `json:"questionsForHR"`
	Note            string   `json:"note"`
}

func (e *Engine) severanceNet(in *CaseInput) (net, fed, fica, state Cents) {
	gross := Dollars(in.Severance.Gross)
	fed = gross.Mul(e.T.Tax.SupplementalWithholdingPct / 100)
	fica = gross.Mul(e.T.Tax.FICAPct / 100)
	state = gross.Mul(e.T.States[in.State].SeveranceStateTaxPct / 100)
	return gross - fed - fica - state, fed, fica, state
}

func (e *Engine) Severance(in *CaseInput) SeveranceResult {
	net, fed, fica, state := e.severanceNet(in)
	q := []string{
		"Can the severance be extended by one more month of pay?",
		"Will the company pay or subsidize my COBRA premiums, and for how long?",
		"Will my earned bonus or commission for this year be paid out, and when?",
		"When exactly does my health coverage end (last day of employment or end of the month)?",
		"Is unused PTO paid out, and is it included in the severance amount?",
		"What happens to unvested equity or 401(k) match?",
		"Can the release deadline be extended so I can review it with an employment attorney?",
	}
	if in.Age >= 40 {
		q = append(q, "Since I am 40+, please confirm the OWBPA consideration period (21 or 45 days) and the 7-day revocation window.")
	}
	if in.Has401kLoan {
		q = append(q, "What is the payoff deadline for my 401(k) loan, and can I keep repaying it after separation?")
	}
	return SeveranceResult{
		Gross: Dollars(in.Severance.Gross).Whole(), FederalWithheld: fed.Whole(), FICA: fica.Whole(),
		StateWithheld: state.Whole(), NetEstimate: net.Whole(),
		SignBy: in.Severance.SignBy, PaidOn: in.Severance.PaidOn, QuestionsForHR: q,
		Note: "Withholding estimate. Your final tax depends on your total income for the year. We do not review agreement terms; consider an employment attorney.",
	}
}
