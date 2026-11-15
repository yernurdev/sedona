package billing

import (
	"errors"

	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/webhook"
)

var ErrNotConfigured = errors.New("payments are not configured on this server")

const (
	FirstMonthCents = 3900
	MonthlyCents    = 1499
	TestCard        = "4242 4242 4242 4242"
)

type Config struct {
	SecretKey     string
	WebhookSecret string
	PriceMonthly  string
	PriceSetup    string
	FrontendURL   string
}

type Billing struct{ cfg Config }

func New(cfg Config) *Billing {
	if cfg.SecretKey != "" {
		stripe.Key = cfg.SecretKey
	}
	return &Billing{cfg: cfg}
}

func (b *Billing) Enabled() bool { return b.cfg.SecretKey != "" }

// Checkout creates a subscription Checkout Session: $14.99/mo plus a one-time
// $24.01 setup item on the first invoice, so the first month totals $39.
func (b *Billing) Checkout(caseID string) (id, url string, err error) {
	if !b.Enabled() {
		return "", "", ErrNotConfigured
	}
	monthly := &stripe.CheckoutSessionLineItemParams{Quantity: stripe.Int64(1)}
	setup := &stripe.CheckoutSessionLineItemParams{Quantity: stripe.Int64(1)}
	if b.cfg.PriceMonthly != "" && b.cfg.PriceSetup != "" {
		monthly.Price = stripe.String(b.cfg.PriceMonthly)
		setup.Price = stripe.String(b.cfg.PriceSetup)
	} else {
		monthly.PriceData = &stripe.CheckoutSessionLineItemPriceDataParams{
			Currency:    stripe.String("usd"),
			UnitAmount:  stripe.Int64(MonthlyCents),
			ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{Name: stripe.String("Sedona Transition plan")},
			Recurring:   &stripe.CheckoutSessionLineItemPriceDataRecurringParams{Interval: stripe.String("month")},
		}
		setup.PriceData = &stripe.CheckoutSessionLineItemPriceDataParams{
			Currency:    stripe.String("usd"),
			UnitAmount:  stripe.Int64(FirstMonthCents - MonthlyCents),
			ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{Name: stripe.String("Survival kit (first month)")},
		}
	}
	params := &stripe.CheckoutSessionParams{
		Mode:              stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems:         []*stripe.CheckoutSessionLineItemParams{monthly, setup},
		SuccessURL:        stripe.String(b.cfg.FrontendURL + "/plan/" + caseID + "?paid=1"),
		CancelURL:         stripe.String(b.cfg.FrontendURL + "/summary/" + caseID),
		ClientReferenceID: stripe.String(caseID),
	}
	params.AddMetadata("caseId", caseID)
	s, err := session.New(params)
	if err != nil {
		return "", "", err
	}
	return s.ID, s.URL, nil
}

type SessionStatus struct {
	Paid           bool
	SubscriptionID string
	Status         string
}

func (b *Billing) SessionStatus(id string) (SessionStatus, error) {
	if !b.Enabled() {
		return SessionStatus{}, ErrNotConfigured
	}
	s, err := session.Get(id, nil)
	if err != nil {
		return SessionStatus{}, err
	}
	st := SessionStatus{Status: string(s.Status), Paid: s.PaymentStatus == stripe.CheckoutSessionPaymentStatusPaid}
	if s.Subscription != nil {
		st.SubscriptionID = s.Subscription.ID
	}
	return st, nil
}

type WebhookEvent struct {
	Type           string
	SessionID      string
	SubscriptionID string
	Paid           bool
}

func (b *Billing) ParseWebhook(payload []byte, sig string) (WebhookEvent, error) {
	if b.cfg.WebhookSecret == "" {
		return WebhookEvent{}, ErrNotConfigured
	}
	ev, err := webhook.ConstructEventWithOptions(payload, sig, b.cfg.WebhookSecret, webhook.ConstructEventOptions{IgnoreAPIVersionMismatch: true})
	if err != nil {
		return WebhookEvent{}, err
	}
	out := WebhookEvent{Type: string(ev.Type)}
	switch ev.Type {
	case "checkout.session.completed":
		var s stripe.CheckoutSession
		if err := s.UnmarshalJSON(ev.Data.Raw); err != nil {
			return out, err
		}
		out.SessionID = s.ID
		out.Paid = s.PaymentStatus == stripe.CheckoutSessionPaymentStatusPaid
		if s.Subscription != nil {
			out.SubscriptionID = s.Subscription.ID
		}
	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := sub.UnmarshalJSON(ev.Data.Raw); err != nil {
			return out, err
		}
		out.SubscriptionID = sub.ID
	}
	return out, nil
}
