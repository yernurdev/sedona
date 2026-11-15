package calc

import (
	"errors"
	"fmt"
	"time"
)

type Person struct {
	Relation string `json:"relation"`
	Age      int    `json:"age"`
}

type Severance struct {
	Gross  float64 `json:"gross"`
	SignBy string  `json:"signBy,omitempty"`
	PaidOn string  `json:"paidOn,omitempty"`
}

type InsuranceInput struct {
	CobraMonthlyFromLetter *float64 `json:"cobraMonthlyFromLetter"`
	SpousePlanMonthly      *float64 `json:"spousePlanMonthly"`
	FSABalance             float64  `json:"fsaBalance"`
	HSABalance             float64  `json:"hsaBalance"`
}

type Reemployment struct {
	Weeks  int     `json:"weeks"`
	Salary float64 `json:"salary"`
}

type CaseInput struct {
	State                string         `json:"state"`
	Age                  int            `json:"age"`
	Household            []Person       `json:"household"`
	LastDay              string         `json:"lastDay"`
	CoverageEndDate      string         `json:"coverageEndDate"`
	CobraNoticeDate      *string        `json:"cobraNoticeDate"`
	AnnualSalary         float64        `json:"annualSalary"`
	YTDWages             float64        `json:"ytdWages"`
	Severance            Severance      `json:"severance"`
	Insurance            InsuranceInput `json:"insurance"`
	SpouseAnnualIncome   float64        `json:"spouseAnnualIncome"`
	Savings              float64        `json:"savings"`
	MonthlyExpenses      float64        `json:"monthlyExpenses"`
	Has401kLoan          bool           `json:"has401kLoan"`
	GroupLayoff          bool           `json:"groupLayoff"`
	ExpectedReemployment Reemployment   `json:"expectedReemployment"`
}

// Dates is the parsed, validated date view of a case.
type Dates struct {
	LastDay       time.Time
	CoverageEnd   time.Time
	CobraNotice   *time.Time
	SignBy        *time.Time
	SeverancePaid time.Time
	Reemployed    time.Time
}

var ErrUnsupportedState = errors.New("unsupported state")

func (in *CaseInput) Validate(supported func(string) bool) (*Dates, error) {
	if !supported(in.State) {
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedState, in.State)
	}
	if len(in.Household) < 1 || len(in.Household) > 8 {
		return nil, errors.New("household must have 1 to 8 people")
	}
	hasSelf := false
	for _, p := range in.Household {
		if p.Age < 0 || p.Age > 110 {
			return nil, errors.New("ages must be between 0 and 110")
		}
		if p.Relation == "self" {
			hasSelf = true
			in.Age = p.Age
		}
	}
	if !hasSelf {
		return nil, errors.New("household must include self")
	}
	for name, v := range map[string]float64{
		"annualSalary": in.AnnualSalary, "ytdWages": in.YTDWages, "severance.gross": in.Severance.Gross,
		"savings": in.Savings, "monthlyExpenses": in.MonthlyExpenses, "spouseAnnualIncome": in.SpouseAnnualIncome,
		"fsaBalance": in.Insurance.FSABalance, "expectedReemployment.salary": in.ExpectedReemployment.Salary,
	} {
		if v < 0 || v > 100_000_000 {
			return nil, fmt.Errorf("%s must be between 0 and 100,000,000", name)
		}
	}
	if in.ExpectedReemployment.Weeks < 1 || in.ExpectedReemployment.Weeks > 104 {
		return nil, errors.New("expected weeks to a new job must be 1 to 104")
	}
	d := &Dates{}
	var err error
	if d.LastDay, err = ParseDate(in.LastDay); err != nil {
		return nil, errors.New("lastDay must be YYYY-MM-DD")
	}
	if d.CoverageEnd, err = ParseDate(in.CoverageEndDate); err != nil {
		return nil, errors.New("coverageEndDate must be YYYY-MM-DD")
	}
	if d.CoverageEnd.Before(d.LastDay) {
		return nil, errors.New("coverage cannot end before your last day")
	}
	if in.CobraNoticeDate != nil && *in.CobraNoticeDate != "" {
		t, err := ParseDate(*in.CobraNoticeDate)
		if err != nil {
			return nil, errors.New("cobraNoticeDate must be YYYY-MM-DD")
		}
		d.CobraNotice = &t
	}
	if in.Severance.SignBy != "" {
		t, err := ParseDate(in.Severance.SignBy)
		if err != nil {
			return nil, errors.New("severance.signBy must be YYYY-MM-DD")
		}
		d.SignBy = &t
	}
	d.SeverancePaid = d.LastDay
	if in.Severance.PaidOn != "" {
		if d.SeverancePaid, err = ParseDate(in.Severance.PaidOn); err != nil {
			return nil, errors.New("severance.paidOn must be YYYY-MM-DD")
		}
	}
	if in.ExpectedReemployment.Salary == 0 {
		in.ExpectedReemployment.Salary = in.AnnualSalary
	}
	d.Reemployed = addDays(d.LastDay, 7*in.ExpectedReemployment.Weeks)
	return d, nil
}

func (in *CaseInput) HasSpouse() bool {
	for _, p := range in.Household {
		if p.Relation == "spouse" {
			return true
		}
	}
	return false
}
