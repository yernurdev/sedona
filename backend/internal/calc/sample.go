package calc

import "time"

// SampleCase builds the "Jessica, 38, Austin TX" demo input with dates relative to today.
func SampleCase(today time.Time) CaseInput {
	last := addDays(today, -2)
	covEnd := addDays(firstOfMonth(last).AddDate(0, 1, 0), -1)
	if daysBetween(today, covEnd) < 7 {
		covEnd = addDays(firstOfMonth(last).AddDate(0, 2, 0), -1)
	}
	return CaseInput{
		State: "TX", Age: 38,
		Household: []Person{{"self", 38}, {"spouse", 40}, {"child", 6}},
		LastDay:   fmtDate(last), CoverageEndDate: fmtDate(covEnd),
		AnnualSalary: 92000, YTDWages: float64(int(92000.0 * float64(last.YearDay()) / 365)),
		Severance:          Severance{Gross: 23000, SignBy: fmtDate(addDays(last, 21)), PaidOn: fmtDate(addDays(last, 7))},
		Insurance:          InsuranceInput{FSABalance: 640},
		SpouseAnnualIncome: 0, Savings: 18000, MonthlyExpenses: 5200,
		ExpectedReemployment: Reemployment{Weeks: 13, Salary: 92000},
	}
}
