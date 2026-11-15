package ics

import (
	"fmt"
	"strings"
	"time"
)

type Event struct {
	UID         string
	Date        time.Time
	Summary     string
	Description string
	URL         string
	AlarmDays   int
}

type Weekly struct {
	UID         string
	Start       time.Time
	IntervalWk  int
	Count       int
	Summary     string
	Description string
	URL         string
}

// Build renders an RFC 5545 calendar with all-day deadline events and one recurring reminder.
func Build(name string, events []Event, weekly *Weekly) string {
	var b strings.Builder
	w := func(s string) { b.WriteString(fold(s) + "\r\n") }
	stamp := time.Now().UTC().Format("20060102T150405Z")
	w("BEGIN:VCALENDAR")
	w("VERSION:2.0")
	w("PRODID:-//Sedona//Layoff Day 1//EN")
	w("CALSCALE:GREGORIAN")
	w("METHOD:PUBLISH")
	w("X-WR-CALNAME:" + esc(name))
	for _, e := range events {
		w("BEGIN:VEVENT")
		w("UID:" + e.UID)
		w("DTSTAMP:" + stamp)
		w("DTSTART;VALUE=DATE:" + e.Date.Format("20060102"))
		w("DTEND;VALUE=DATE:" + e.Date.AddDate(0, 0, 1).Format("20060102"))
		w("SUMMARY:" + esc(e.Summary))
		w("DESCRIPTION:" + esc(e.Description))
		if e.URL != "" {
			w("URL:" + e.URL)
		}
		if e.AlarmDays > 0 {
			w("BEGIN:VALARM")
			w("ACTION:DISPLAY")
			w("DESCRIPTION:" + esc(e.Summary))
			w(fmt.Sprintf("TRIGGER:-P%dD", e.AlarmDays))
			w("END:VALARM")
		}
		w("END:VEVENT")
	}
	if weekly != nil {
		w("BEGIN:VEVENT")
		w("UID:" + weekly.UID)
		w("DTSTAMP:" + stamp)
		w("DTSTART:" + weekly.Start.Format("20060102") + "T170000Z")
		w("DURATION:PT30M")
		w(fmt.Sprintf("RRULE:FREQ=WEEKLY;INTERVAL=%d;COUNT=%d", weekly.IntervalWk, weekly.Count))
		w("SUMMARY:" + esc(weekly.Summary))
		w("DESCRIPTION:" + esc(weekly.Description))
		if weekly.URL != "" {
			w("URL:" + weekly.URL)
		}
		w("BEGIN:VALARM")
		w("ACTION:DISPLAY")
		w("DESCRIPTION:" + esc(weekly.Summary))
		w("TRIGGER:-PT1H")
		w("END:VALARM")
		w("END:VEVENT")
	}
	w("END:VCALENDAR")
	return b.String()
}

func esc(s string) string {
	r := strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`)
	return r.Replace(s)
}

func fold(line string) string {
	if len(line) <= 75 {
		return line
	}
	var b strings.Builder
	for len(line) > 75 {
		cut := 75
		for cut > 0 && (line[cut]&0xC0) == 0x80 {
			cut--
		}
		b.WriteString(line[:cut] + "\r\n ")
		line = line[cut:]
	}
	b.WriteString(line)
	return b.String()
}
