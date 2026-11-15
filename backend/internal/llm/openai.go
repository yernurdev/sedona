package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// openAICompat talks to any OpenAI-compatible chat completions endpoint (Gemini, Groq, OpenRouter).
type openAICompat struct {
	baseURL, apiKey, model string
	http                   *http.Client
}

func (o *openAICompat) complete(ctx context.Context, prompt string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": o.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": prompt},
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(o.baseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+o.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := o.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("provider status %d: %.200s", resp.StatusCode, raw)
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", errors.New("empty response from text service")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func newOpenAICompat(baseURL, apiKey, model string) *openAICompat {
	return &openAICompat{baseURL: baseURL, apiKey: apiKey, model: model, http: &http.Client{Timeout: 90 * time.Second}}
}
