package llm

import (
	"context"
	"errors"
	"strings"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

var ErrNotConfigured = errors.New("text generation is not configured on this server")

const systemPrompt = `You write short, plain-English text for people in the United States who were just laid off.
You receive numbers that our calculator already computed. Use only those numbers; never invent amounts, dates or rules.
Do not give legal, tax, medical, insurance or investment advice and do not tell the reader which option to choose.
Describe what the numbers mean and what to verify with official sources. No markdown headings.`

type Client struct {
	api    *anthropic.Client
	compat *openAICompat
	model  string
}

var compatDefaults = map[string][2]string{
	"gemini": {"https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"},
	"groq":   {"https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"},
	"openai": {"https://api.openai.com/v1", "gpt-4o-mini"},
}

// New picks the provider: "anthropic" uses the official SDK; "gemini", "groq",
// "openai" or any baseURL use an OpenAI-compatible chat completions endpoint.
func New(provider, apiKey, model, baseURL string) *Client {
	if apiKey == "" {
		return &Client{}
	}
	if provider == "" || provider == "anthropic" {
		if model == "" {
			model = "claude-opus-5-5"
		}
		c := anthropic.NewClient(option.WithAPIKey(apiKey))
		return &Client{api: &c, model: model}
	}
	d := compatDefaults[provider]
	if baseURL == "" {
		baseURL = d[0]
	}
	if model == "" {
		model = d[1]
	}
	if baseURL == "" || model == "" {
		return &Client{}
	}
	return &Client{compat: newOpenAICompat(baseURL, apiKey, model), model: model}
}

func (c *Client) Enabled() bool { return c.api != nil || c.compat != nil }

func (c *Client) Complete(ctx context.Context, prompt string) (string, error) {
	if c.compat != nil {
		return c.compat.complete(ctx, prompt)
	}
	if c.api == nil {
		return "", ErrNotConfigured
	}
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 16000,
		System:    []anthropic.TextBlockParam{{Text: systemPrompt}},
		Messages:  []anthropic.MessageParam{anthropic.NewUserMessage(anthropic.NewTextBlock(prompt))},
	})
	if err != nil {
		return "", err
	}
	if resp.StopReason == "refusal" {
		return "", errors.New("the text service declined this request")
	}
	var out strings.Builder
	for _, block := range resp.Content {
		if t, ok := block.AsAny().(anthropic.TextBlock); ok {
			out.WriteString(t.Text)
		}
	}
	if out.Len() == 0 {
		return "", errors.New("empty response from text service")
	}
	return strings.TrimSpace(out.String()), nil
}
