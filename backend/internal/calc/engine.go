package calc

import "github.com/yernurdev/sedona/backend/internal/data"

type Engine struct {
	T *data.Tables
}

func New(t *data.Tables) *Engine { return &Engine{T: t} }

func (e *Engine) Supported(code string) bool {
	s, ok := e.T.States[code]
	return ok && s.Supported
}
