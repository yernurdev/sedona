package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/yernurdev/sedona/backend/internal/billing"
	"github.com/yernurdev/sedona/backend/internal/calc"
	"github.com/yernurdev/sedona/backend/internal/data"
	"github.com/yernurdev/sedona/backend/internal/httpapi"
	"github.com/yernurdev/sedona/backend/internal/llm"
	"github.com/yernurdev/sedona/backend/internal/store"
)

var version = "dev"

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	tables, err := data.Load(env("DATA_DIR", "data"))
	if err != nil {
		return err
	}
	st, err := store.Open(env("DB_PATH", "sedona.db"))
	if err != nil {
		return err
	}
	defer st.Close()

	frontend := strings.TrimRight(env("FRONTEND_URL", "http://localhost:5173"), "/")
	var origins []string
	for _, o := range strings.Split(env("FRONTEND_ORIGINS", frontend), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	srv := &httpapi.Server{
		Store:  st,
		Engine: calc.New(tables),
		Tables: tables,
		Billing: billing.New(billing.Config{
			SecretKey: os.Getenv("STRIPE_SECRET_KEY"), WebhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
			PriceMonthly: os.Getenv("STRIPE_PRICE_MONTHLY"), PriceSetup: os.Getenv("STRIPE_PRICE_SETUP"), FrontendURL: frontend,
		}),
		LLM:         llm.New(env("LLM_PROVIDER", "anthropic"), os.Getenv("LLM_API_KEY"), os.Getenv("LLM_MODEL"), os.Getenv("LLM_BASE_URL")),
		Origins:     origins,
		FrontendURL: frontend,
		Version:     version,
		Log:         log,
	}
	hs := &http.Server{
		Addr:              ":" + env("PORT", "8080"),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      120 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = hs.Shutdown(sctx)
	}()
	log.Info("listening", "addr", hs.Addr, "stripe", srv.Billing.Enabled(), "llm", srv.LLM.Enabled(), "origins", origins)
	if err := hs.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
