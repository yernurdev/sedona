package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/yernurdev/sedona/backend/internal/billing"
	"github.com/yernurdev/sedona/backend/internal/calc"
	"github.com/yernurdev/sedona/backend/internal/data"
	"github.com/yernurdev/sedona/backend/internal/llm"
	"github.com/yernurdev/sedona/backend/internal/store"
)

type Server struct {
	Store       *store.Store
	Engine      *calc.Engine
	Tables      *data.Tables
	Billing     *billing.Billing
	LLM         *llm.Client
	Origins     []string
	FrontendURL string
	Version     string
	Log         *slog.Logger

	limiter *ipLimiter
}

func (s *Server) Handler() http.Handler {
	s.limiter = newIPLimiter(120, time.Minute)
	m := http.NewServeMux()
	m.HandleFunc("GET /api/health", s.health)
	m.HandleFunc("GET /api/meta/states", s.metaStates)
	m.HandleFunc("GET /api/meta/sources", s.metaSources)

	m.HandleFunc("POST /api/sessions", s.createSession)
	m.HandleFunc("GET /api/sessions/me", s.auth(s.getSession))
	m.HandleFunc("PATCH /api/sessions/me", s.auth(s.patchSession))

	m.HandleFunc("POST /api/cases", s.auth(s.createCase))
	m.HandleFunc("POST /api/cases/sample", s.auth(s.createSample))
	m.HandleFunc("GET /api/cases/{id}", s.auth(s.withCase(s.getCase)))
	m.HandleFunc("PATCH /api/cases/{id}", s.auth(s.withCase(s.patchCase)))
	m.HandleFunc("GET /api/cases/{id}/summary", s.auth(s.withCase(s.summary)))
	m.HandleFunc("GET /api/cases/{id}/plan", s.auth(s.withCase(s.paid(s.plan))))
	m.HandleFunc("GET /api/cases/{id}/calendar.ics", s.calendar)

	m.HandleFunc("POST /api/cases/{id}/checkins", s.auth(s.withCase(s.paid(s.postCheckin))))
	m.HandleFunc("GET /api/cases/{id}/checkins", s.auth(s.withCase(s.paid(s.listCheckins))))
	m.HandleFunc("GET /api/cases/{id}/checkins/{week}", s.auth(s.withCase(s.paid(s.getCheckin))))
	m.HandleFunc("GET /api/cases/{id}/checkins/{week}/record.csv", s.auth(s.withCase(s.paid(s.checkinCSV))))

	m.HandleFunc("POST /api/cases/{id}/offers", s.auth(s.withCase(s.paid(s.postOffer))))
	m.HandleFunc("GET /api/cases/{id}/offers", s.auth(s.withCase(s.paid(s.listOffers))))
	m.HandleFunc("DELETE /api/cases/{id}/offers/{offerId}", s.auth(s.withCase(s.paid(s.deleteOffer))))
	m.HandleFunc("GET /api/cases/{id}/tax-preview", s.auth(s.withCase(s.paid(s.taxPreview))))

	m.HandleFunc("POST /api/cases/{id}/hr-letter", s.auth(s.withCase(s.paid(s.hrLetter))))
	m.HandleFunc("POST /api/cases/{id}/explain", s.auth(s.withCase(s.paid(s.explain))))

	m.HandleFunc("POST /api/cases/{id}/demo/advance", s.auth(s.withCase(s.demoAdvance)))
	m.HandleFunc("POST /api/cases/{id}/demo/unlock", s.auth(s.withCase(s.demoUnlock)))

	m.HandleFunc("GET /api/billing/plans", s.billingPlans)
	m.HandleFunc("POST /api/billing/checkout", s.auth(s.checkout))
	m.HandleFunc("POST /api/billing/webhook", s.webhook)
	m.HandleFunc("GET /api/billing/status/{id}", s.auth(s.withCase(s.billingStatus)))

	return s.recover(s.cors(s.rateLimit(m)))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": msg}})
}

func (s *Server) internal(w http.ResponseWriter, r *http.Request, err error) {
	s.Log.Error("request failed", "path", r.URL.Path, "err", err)
	writeErr(w, http.StatusInternalServerError, "internal", "Something went wrong on our side. Please try again.")
}

func decode(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return errors.New("invalid JSON body: " + err.Error())
	}
	return nil
}

type ctxKey int

const (
	sessionKey ctxKey = iota
	caseKey
)

func sessionFrom(r *http.Request) store.Session { return r.Context().Value(sessionKey).(store.Session) }
func caseFrom(r *http.Request) store.Case       { return r.Context().Value(caseKey).(store.Case) }

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if t, ok := strings.CutPrefix(h, "Bearer "); ok {
		return strings.TrimSpace(t)
	}
	return ""
}

func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := bearer(r)
		if tok == "" {
			writeErr(w, http.StatusUnauthorized, "unauthorized", "Missing session token.")
			return
		}
		sess, err := s.Store.SessionByToken(r.Context(), tok)
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, http.StatusUnauthorized, "unauthorized", "Session not found. Start a new one.")
			return
		}
		if err != nil {
			s.internal(w, r, err)
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), sessionKey, sess)))
	}
}

func (s *Server) withCase(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := s.Store.GetCase(r.Context(), r.PathValue("id"))
		if errors.Is(err, store.ErrNotFound) || (err == nil && c.SessionID != sessionFrom(r).ID) {
			writeErr(w, http.StatusNotFound, "not_found", "Case not found.")
			return
		}
		if err != nil {
			s.internal(w, r, err)
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), caseKey, c)))
	}
}

func (s *Server) paid(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !caseFrom(r).Paid {
			writeErr(w, http.StatusPaymentRequired, "payment_required", "Unlock the full plan to use this.")
			return
		}
		next(w, r)
	}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		for _, o := range s.Origins {
			if o == origin && origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				s.Log.Error("panic", "path", r.URL.Path, "value", v)
				writeErr(w, http.StatusInternalServerError, "internal", "Something went wrong on our side.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.Header.Get("X-Forwarded-For")
		if i := strings.IndexByte(ip, ','); i >= 0 {
			ip = ip[:i]
		}
		if ip == "" {
			ip = r.RemoteAddr
		}
		if r.URL.Path != "/api/billing/webhook" && !s.limiter.allow(strings.TrimSpace(ip)) {
			writeErr(w, http.StatusTooManyRequests, "rate_limited", "Too many requests. Wait a minute and try again.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type ipLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
}

func newIPLimiter(limit int, window time.Duration) *ipLimiter {
	return &ipLimiter{limit: limit, window: window, hits: map[string][]time.Time{}}
}

func (l *ipLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-l.window)
	h := l.hits[key]
	i := 0
	for i < len(h) && h[i].Before(cut) {
		i++
	}
	h = h[i:]
	if len(h) >= l.limit {
		l.hits[key] = h
		return false
	}
	l.hits[key] = append(h, now)
	return true
}
