package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io/fs"
	"sort"
	"time"

	_ "modernc.org/sqlite"

	"github.com/yernurdev/sedona/backend/migrations"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	return s, s.migrate()
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, n := range names {
		b, err := migrations.FS.ReadFile(n)
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(string(b)); err != nil {
			return err
		}
	}
	return nil
}

func NewID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

type Session struct {
	ID        string  `json:"sessionId"`
	CreatedAt string  `json:"createdAt"`
	Email     *string `json:"email,omitempty"`
}

func (s *Store) CreateSession(ctx context.Context) (Session, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return Session{}, "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	sess := Session{ID: NewID(), CreatedAt: now()}
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions(id, token_hash, created_at) VALUES(?,?,?)`, sess.ID, HashToken(token), sess.CreatedAt)
	return sess, token, err
}

func (s *Store) SessionByToken(ctx context.Context, token string) (Session, error) {
	var sess Session
	err := s.db.QueryRowContext(ctx, `SELECT id, created_at, email FROM sessions WHERE token_hash = ?`, HashToken(token)).
		Scan(&sess.ID, &sess.CreatedAt, &sess.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return sess, ErrNotFound
	}
	return sess, err
}

func (s *Store) SetEmail(ctx context.Context, id, email string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET email = ? WHERE id = ?`, email, id)
	return err
}

type Case struct {
	ID            string
	SessionID     string
	InputJSON     string
	IsSample      bool
	Paid          bool
	SimOffsetDays int
	CreatedAt     time.Time
}

func (s *Store) CreateCase(ctx context.Context, sessionID, input string, sample bool) (string, error) {
	id := NewID()
	t := now()
	_, err := s.db.ExecContext(ctx, `INSERT INTO cases(id, session_id, input_json, is_sample, created_at, updated_at) VALUES(?,?,?,?,?,?)`,
		id, sessionID, input, sample, t, t)
	return id, err
}

func (s *Store) GetCase(ctx context.Context, id string) (Case, error) {
	var c Case
	var created string
	err := s.db.QueryRowContext(ctx, `SELECT id, session_id, input_json, is_sample, paid, sim_offset_days, created_at FROM cases WHERE id = ?`, id).
		Scan(&c.ID, &c.SessionID, &c.InputJSON, &c.IsSample, &c.Paid, &c.SimOffsetDays, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return c, ErrNotFound
	}
	if err != nil {
		return c, err
	}
	c.CreatedAt, err = time.Parse(time.RFC3339, created)
	return c, err
}

func (s *Store) UpdateCaseInput(ctx context.Context, id, input string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE cases SET input_json = ?, updated_at = ? WHERE id = ?`, input, now(), id)
	return err
}

func (s *Store) SetPaid(ctx context.Context, id string, paid bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE cases SET paid = ?, updated_at = ? WHERE id = ?`, paid, now(), id)
	return err
}

func (s *Store) AdvanceDays(ctx context.Context, id string, days int) error {
	_, err := s.db.ExecContext(ctx, `UPDATE cases SET sim_offset_days = sim_offset_days + ?, updated_at = ? WHERE id = ?`, days, now(), id)
	return err
}

type Checkin struct {
	WeekStart      string
	ActivitiesJSON string
	EarningsCents  int64
}

func (s *Store) UpsertCheckin(ctx context.Context, caseID string, c Checkin) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO checkins(id, case_id, week_start, activities_json, earnings_cents, created_at) VALUES(?,?,?,?,?,?)
		ON CONFLICT(case_id, week_start) DO UPDATE SET activities_json = excluded.activities_json, earnings_cents = excluded.earnings_cents`,
		NewID(), caseID, c.WeekStart, c.ActivitiesJSON, c.EarningsCents, now())
	return err
}

func (s *Store) ListCheckins(ctx context.Context, caseID string) ([]Checkin, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT week_start, activities_json, earnings_cents FROM checkins WHERE case_id = ? ORDER BY week_start DESC`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Checkin
	for rows.Next() {
		var c Checkin
		if err := rows.Scan(&c.WeekStart, &c.ActivitiesJSON, &c.EarningsCents); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) GetCheckin(ctx context.Context, caseID, week string) (Checkin, error) {
	c := Checkin{WeekStart: week}
	err := s.db.QueryRowContext(ctx, `SELECT activities_json, earnings_cents FROM checkins WHERE case_id = ? AND week_start = ?`, caseID, week).
		Scan(&c.ActivitiesJSON, &c.EarningsCents)
	if errors.Is(err, sql.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

type Offer struct {
	ID        string
	InputJSON string
	CreatedAt string
}

func (s *Store) CreateOffer(ctx context.Context, caseID, input string) (string, error) {
	id := NewID()
	_, err := s.db.ExecContext(ctx, `INSERT INTO offers(id, case_id, input_json, created_at) VALUES(?,?,?,?)`, id, caseID, input, now())
	return id, err
}

func (s *Store) ListOffers(ctx context.Context, caseID string) ([]Offer, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, input_json, created_at FROM offers WHERE case_id = ? ORDER BY created_at`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Offer
	for rows.Next() {
		var o Offer
		if err := rows.Scan(&o.ID, &o.InputJSON, &o.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *Store) DeleteOffer(ctx context.Context, caseID, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM offers WHERE case_id = ? AND id = ?`, caseID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) CreatePayment(ctx context.Context, caseID, stripeSessionID string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO payments(id, case_id, stripe_session_id, status, created_at) VALUES(?,?,?,?,?)`,
		NewID(), caseID, stripeSessionID, "open", now())
	return err
}

type Payment struct {
	CaseID          string
	StripeSessionID string
	SubscriptionID  string
	Status          string
}

func (s *Store) LatestPayment(ctx context.Context, caseID string) (Payment, error) {
	p := Payment{CaseID: caseID}
	var sub sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT stripe_session_id, stripe_subscription_id, status FROM payments WHERE case_id = ? ORDER BY created_at DESC LIMIT 1`, caseID).
		Scan(&p.StripeSessionID, &sub, &p.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	}
	p.SubscriptionID = sub.String
	return p, err
}

func (s *Store) UpdatePayment(ctx context.Context, stripeSessionID, subscriptionID, status string) (string, error) {
	var caseID string
	err := s.db.QueryRowContext(ctx, `UPDATE payments SET stripe_subscription_id = COALESCE(NULLIF(?, ''), stripe_subscription_id), status = ? WHERE stripe_session_id = ? RETURNING case_id`,
		subscriptionID, status, stripeSessionID).Scan(&caseID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return caseID, err
}

func (s *Store) CaseBySubscription(ctx context.Context, subID string) (string, error) {
	var caseID string
	err := s.db.QueryRowContext(ctx, `SELECT case_id FROM payments WHERE stripe_subscription_id = ? LIMIT 1`, subID).Scan(&caseID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return caseID, err
}

// RecordLLMCall stores a call and reports how many calls the case made in the last hour.
func (s *Store) RecordLLMCall(ctx context.Context, caseID, kind string) (int, error) {
	var n int
	since := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM llm_calls WHERE case_id = ? AND created_at > ?`, caseID, since).Scan(&n); err != nil {
		return 0, err
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO llm_calls(id, case_id, kind, created_at) VALUES(?,?,?,?)`, NewID(), caseID, kind, now())
	return n + 1, err
}
