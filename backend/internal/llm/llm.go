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
	api   *anthropic.Client
	model string
}

func New(provider, apiKey, model string) *Client {
	if apiKey == "" || (provider != "" && provider != "anthropic") {
		return &Client{}
	}
	if model == "" {
		model = "claude-opus-5-5"
	}
	c := anthropic.NewClient(option.WithAPIKey(apiKey))
	return &Client{api: &c, model: model}
}

func (c *Client) Enabled() bool { return c.api != nil }

func (c *Client) Complete(ctx context.Context, prompt string) (string, error) {
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
