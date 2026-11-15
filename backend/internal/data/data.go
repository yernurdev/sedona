package data

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
)

type FPLYear struct {
	Base          int64 `json:"base"`
	PerAdditional int64 `json:"perAdditional"`
	Estimate      bool  `json:"estimate"`
}

type FPL struct {
	Source string             `json:"source"`
	AsOf   string             `json:"asOf"`
	Years  map[string]FPLYear `json:"years"`
}

type PctBand struct {
	FromPct float64 `json:"fromPct"`
	ToPct   float64 `json:"toPct"`
	Initial float64 `json:"initial"`
	Final   float64 `json:"final"`
}

type PctYear struct {
	Estimate bool      `json:"estimate"`
	Bands    []PctBand `json:"bands"`
}

type ApplicablePct struct {
	Source string             `json:"source"`
	AsOf   string             `json:"asOf"`
	Years  map[string]PctYear `json:"years"`
}

type BenchmarkYear struct {
	Estimate bool             `json:"estimate"`
	States   map[string]int64 `json:"states"`
}

type Benchmarks struct {
	Source string                   `json:"source"`
	AsOf   string                   `json:"asOf"`
	Years  map[string]BenchmarkYear `json:"years"`
}

type AgeCurve struct {
	Source  string    `json:"source"`
	AsOf    string    `json:"asOf"`
	Factors []float64 `json:"factors"`
}

type CobraDefaults struct {
	Source           string  `json:"source"`
	AsOf             string  `json:"asOf"`
	SingleAnnual     int64   `json:"singleAnnual"`
	FamilyAnnual     int64   `json:"familyAnnual"`
	CobraMultiplier  float64 `json:"cobraMultiplier"`
	MultiplierSource string  `json:"multiplierSource"`
	Estimate         bool    `json:"estimate"`
}

type DeadlineRule struct {
	Days   int    `json:"days"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	Source string `json:"source"`
}

type Deadlines struct {
	AsOf  string                  `json:"asOf"`
	Rules map[string]DeadlineRule `json:"rules"`
}

type Bracket [2]float64

type Filing struct {
	StandardDeduction int64     `json:"standardDeduction"`
	Brackets          []Bracket `json:"brackets"`
}

type FederalTax struct {
	Source                     string            `json:"source"`
	AsOf                       string            `json:"asOf"`
	SupplementalWithholdingPct float64           `json:"supplementalWithholdingPct"`
	FICAPct                    float64           `json:"ficaPct"`
	UIVoluntaryWithholdingPct  float64           `json:"uiVoluntaryWithholdingPct"`
	Filing                     map[string]Filing `json:"filing"`
}

type Benefit struct {
	HighQuarterFraction float64 `json:"highQuarterFraction"`
	MinWeekly           int64   `json:"minWeekly"`
	MaxWeekly           int64   `json:"maxWeekly"`
	MaxWeeks            int     `json:"maxWeeks"`
	WaitingWeek         bool    `json:"waitingWeek"`
	Estimate            bool    `json:"estimate"`
}

type WorkSearch struct {
	PerWeek int    `json:"perWeek"`
	Rule    string `json:"rule"`
	Unique  bool   `json:"unique"`
}

type Certification struct {
	EveryDays int    `json:"everyDays"`
	Weekday   string `json:"weekday"`
	Label     string `json:"label"`
}

type State struct {
	Code                 string        `json:"code"`
	Name                 string        `json:"name"`
	Supported            bool          `json:"supported"`
	Source               string        `json:"source"`
	WorkSearchSource     string        `json:"workSearchSource"`
	AsOf                 string        `json:"asOf"`
	Benefit              Benefit       `json:"benefit"`
	WorkSearch           WorkSearch    `json:"workSearch"`
	Certification        Certification `json:"certification"`
	PortalURL            string        `json:"portalUrl"`
	MedicaidExpansion    bool          `json:"medicaidExpansion"`
	SeveranceStateTaxPct float64       `json:"severanceStateTaxPct"`
	HowToFile            []string      `json:"howToFile"`
}

type Source struct {
	Dataset  string `json:"dataset"`
	Source   string `json:"source"`
	AsOf     string `json:"asOf"`
	Estimate bool   `json:"estimate"`
}

type Tables struct {
	FPL        FPL
	Pct        ApplicablePct
	Benchmarks Benchmarks
	AgeCurve   AgeCurve
	Cobra      CobraDefaults
	Deadlines  Deadlines
	Tax        FederalTax
	States     map[string]State
}

func Load(dir string) (*Tables, error) {
	t := &Tables{States: map[string]State{}}
	files := []struct {
		name string
		dst  any
	}{
		{"fpl.json", &t.FPL},
		{"applicable_percentage.json", &t.Pct},
		{"benchmark_premiums.json", &t.Benchmarks},
		{"age_curve.json", &t.AgeCurve},
		{"cobra_defaults.json", &t.Cobra},
		{"deadlines.json", &t.Deadlines},
		{"federal_tax_2026.json", &t.Tax},
	}
	for _, f := range files {
		if err := readJSON(filepath.Join(dir, f.name), f.dst); err != nil {
			return nil, err
		}
	}
	paths, err := filepath.Glob(filepath.Join(dir, "states", "*.json"))
	if err != nil {
		return nil, err
	}
	for _, p := range paths {
		var s State
		if err := readJSON(p, &s); err != nil {
			return nil, err
		}
		t.States[s.Code] = s
	}
	return t, t.validate()
}

func readJSON(path string, dst any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	if err := json.Unmarshal(b, dst); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	return nil
}

func (t *Tables) validate() error {
	if len(t.AgeCurve.Factors) != 65 {
		return fmt.Errorf("age curve must have 65 factors, got %d", len(t.AgeCurve.Factors))
	}
	if len(t.States) == 0 {
		return fmt.Errorf("no state rules loaded")
	}
	for code, s := range t.States {
		if s.Source == "" || s.AsOf == "" {
			return fmt.Errorf("state %s missing source/asOf", code)
		}
	}
	return nil
}

func (t *Tables) FPLFor(year, household int) (int64, bool, error) {
	y, ok := t.FPL.Years[strconv.Itoa(year)]
	if !ok {
		return 0, false, fmt.Errorf("no poverty guidelines for %d", year)
	}
	return y.Base + int64(household-1)*y.PerAdditional, y.Estimate, nil
}

func (t *Tables) ApplicablePercent(year int, fplPct float64) (float64, bool, error) {
	y, ok := t.Pct.Years[strconv.Itoa(year)]
	if !ok {
		return 0, false, fmt.Errorf("no applicable percentage table for %d", year)
	}
	for _, b := range y.Bands {
		if fplPct >= b.FromPct && fplPct < b.ToPct {
			share := (fplPct - b.FromPct) / (b.ToPct - b.FromPct)
			return b.Initial + share*(b.Final-b.Initial), y.Estimate, nil
		}
	}
	return 0, y.Estimate, fmt.Errorf("fpl %.0f%% outside subsidy bands", fplPct)
}

func (t *Tables) Benchmark40(year int, state string) (int64, bool, error) {
	y, ok := t.Benchmarks.Years[strconv.Itoa(year)]
	if !ok {
		return 0, false, fmt.Errorf("no benchmark premiums for %d", year)
	}
	v, ok := y.States[state]
	if !ok {
		return 0, false, fmt.Errorf("no benchmark premium for %s", state)
	}
	return v, y.Estimate, nil
}

func (t *Tables) AgeFactor(age int) float64 {
	if age < 0 {
		age = 0
	}
	if age > 64 {
		age = 64
	}
	return t.AgeCurve.Factors[age]
}

func (t *Tables) Sources() []Source {
	out := []Source{
		{"Federal Poverty Guidelines", t.FPL.Source, t.FPL.AsOf, t.FPL.Years["2026"].Estimate},
		{"Applicable percentage (ACA subsidy)", t.Pct.Source, t.Pct.AsOf, false},
		{"Benchmark silver premiums by state", t.Benchmarks.Source, t.Benchmarks.AsOf, true},
		{"Default age rating curve", t.AgeCurve.Source, t.AgeCurve.AsOf, false},
		{"Employer premiums (COBRA estimate)", t.Cobra.Source, t.Cobra.AsOf, t.Cobra.Estimate},
		{"COBRA 102% rule", t.Cobra.MultiplierSource, t.Cobra.AsOf, false},
		{"Federal tax brackets 2026", t.Tax.Source, t.Tax.AsOf, false},
	}
	ids := make([]string, 0, len(t.Deadlines.Rules))
	for id := range t.Deadlines.Rules {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		r := t.Deadlines.Rules[id]
		out = append(out, Source{"Deadline: " + r.Title, r.Source, t.Deadlines.AsOf, false})
	}
	codes := make([]string, 0, len(t.States))
	for c := range t.States {
		codes = append(codes, c)
	}
	sort.Strings(codes)
	for _, c := range codes {
		s := t.States[c]
		out = append(out, Source{s.Name + " unemployment benefits", s.Source, s.AsOf, s.Benefit.Estimate})
		out = append(out, Source{s.Name + " work search rule", s.WorkSearchSource, s.AsOf, false})
	}
	return out
}
