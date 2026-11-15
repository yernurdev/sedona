package httpapi

import (
	"context"
	"io"
	"net/http"

	"github.com/yernurdev/sedona/backend/internal/store"
)

func withValues(ctx context.Context, sess store.Session, c store.Case) context.Context {
	return context.WithValue(context.WithValue(ctx, sessionKey, sess), caseKey, c)
}

func readAll(r *http.Request, limit int64) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r.Body, limit))
}
