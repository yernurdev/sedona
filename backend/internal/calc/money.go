package calc

import (
	"math"
	"time"
)

// Cents keeps all money math in integer cents.
type Cents int64

func Dollars(d float64) Cents { return Cents(math.Round(d * 100)) }

func (c Cents) Whole() int64 { return int64(math.Round(float64(c) / 100)) }

func (c Cents) Mul(f float64) Cents { return Cents(math.Round(float64(c) * f)) }

func (c Cents) Div(n int64) Cents {
	if n == 0 {
		return 0
	}
	return Cents(math.Round(float64(c) / float64(n)))
}

func maxC(a, b Cents) Cents {
	if a > b {
		return a
	}
	return b
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }

const dateLayout = "2006-01-02"

func ParseDate(s string) (time.Time, error) { return time.Parse(dateLayout, s) }

func fmtDate(t time.Time) string { return t.Format(dateLayout) }

func daysBetween(a, b time.Time) int { return int(math.Round(b.Sub(a).Hours() / 24)) }

func addDays(t time.Time, d int) time.Time { return t.AddDate(0, 0, d) }

func firstOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func Today() time.Time {
	n := time.Now().UTC()
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, time.UTC)
}
