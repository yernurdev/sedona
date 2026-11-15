package calc

type TaxPreview struct {
	Year                 int64     `json:"year"`
	FilingStatus         string    `json:"filingStatus"`
	ProjectedIncome      int64     `json:"projectedIncome"`
	TaxableIncome        int64     `json:"taxableIncome"`
	MarginalRatePct      float64   `json:"marginalRatePct"`
	UnemploymentTaxable  int64     `json:"unemploymentTaxable"`
	UnemploymentWithheld int64     `json:"unemploymentWithheld"`
	UnemploymentOwed     int64     `json:"unemploymentEstimatedOwed"`
	SeveranceGross       int64     `json:"severanceGross"`
	SeveranceWithheld    int64     `json:"severanceWithheld"`
	SeveranceExtraOwed   int64     `json:"severanceExtraOwed"`
	APTC                 *Clawback `json:"aptc"`
	Notes                []string  `json:"notes"`
	Source               string    `json:"source"`
}

func (e *Engine) TaxPreview(in *CaseInput, d *Dates, withholdUI bool, cb *Clawback) TaxPreview {
	year := d.LastDay.Year()
	plan := IncomePlan{Reemployed: d.Reemployed, NewSalary: in.ExpectedReemployment.Salary}
	magi, br := e.MAGI(in, d, year, plan)
	status := "single"
	if in.HasSpouse() {
		status = "married"
	}
	f := e.T.Tax.Filing[status]
	taxable := maxC(0, magi-Dollars(float64(f.StandardDeduction)))
	marginal := 0.0
	for _, b := range f.Brackets {
		marginal = b[1]
		if b[0] == 0 || float64(taxable) <= b[0]*100 {
			break
		}
	}
	ui := Dollars(float64(br.Unemployment))
	withheld := Cents(0)
	if withholdUI {
		withheld = ui.Mul(e.T.Tax.UIVoluntaryWithholdingPct / 100)
	}
	sev := Dollars(in.Severance.Gross)
	sevWithheld := sev.Mul(e.T.Tax.SupplementalWithholdingPct / 100)
	t := TaxPreview{
		Year: int64(year), FilingStatus: status, ProjectedIncome: magi.Whole(), TaxableIncome: taxable.Whole(),
		MarginalRatePct: marginal, UnemploymentTaxable: ui.Whole(), UnemploymentWithheld: withheld.Whole(),
		UnemploymentOwed: maxC(0, ui.Mul(marginal/100)-withheld).Whole(),
		SeveranceGross:   sev.Whole(), SeveranceWithheld: sevWithheld.Whole(),
		SeveranceExtraOwed: maxC(0, sev.Mul(marginal/100)-sevWithheld).Whole(),
		APTC:               cb, Source: e.T.Tax.Source,
		Notes: []string{
			"Unemployment benefits are taxable federal income. You can ask your state to withhold 10% (IRS Form W-4V).",
			"Severance is withheld at the 22% supplemental rate; your actual rate depends on total income.",
			"Estimates use the standard deduction and your projected income for the year of the layoff.",
		},
	}
	return t
}
