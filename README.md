# Sedona — Layoff Day 1

**Lose your job, not your money.** A money navigator for US office workers (25–45) in the months between jobs.
We don't find you a job. We cover the money side of a layoff: health insurance (COBRA vs Marketplace vs spouse plan),
cash runway, deadlines, unemployment work-search certification, the job offer (benefits, coverage bridge, subsidy clawback) and tax day.

- **Production:** https://sedona-layoff.vercel.app
- **API:** https://94-131-95-178.sslip.io/api/health

## 2-minute demo

1. Open the site → **Try sample case: Jessica, 38, Austin** (marked `SAMPLE DATA · Demo mode`).
2. Summary shows three numbers: insurance per month by option, runway in months, next deadline. Open **How we calculated this**.
3. **Unlock full plan** → pay with test card `4242 4242 4242 4242`, any future date, any CVC (test mode, no real charge).
   The sample case can also be unlocked with **Unlock sample case without paying**.
4. Plan tabs: Insurance, Runway chart, Deadlines (+ `.ics` export with a recurring weekly reminder), Unemployment, Severance (HR questions + email draft), Actions.
5. Press **+1 week** (demo only) → **Weekly check-in**: paste 3 job links → ready-to-paste record for the state portal, CSV, updated runway.
6. **Got an offer?** → offer value after benefits, coverage bridge and the subsidy clawback warning. **Tax preview** shows the April numbers.

Enter your own data via **Start**: a different state or household gives different numbers. Supported states: MO, TX, MI, CA, FL (others get an honest "coming soon").

## Architecture

```
Browser ──HTTPS──> React SPA (Vercel)
                    │ JSON /api
                    ▼
                 Go API (Docker, VM) ── SQLite (volume)
                    ├── backend/data/*.json  (sourced rule tables)
                    ├── Stripe Checkout (test mode, optional) / built-in test checkout
                    └── LLM API (HR email + plain-English explanations)
```

| Part | Stack |
|---|---|
| `backend/` | Go 1.26, `net/http` routing, `modernc.org/sqlite`, `log/slog`, `stripe-go`, Anthropic Go SDK or any OpenAI-compatible endpoint |
| `frontend/` | Vite, React 19, TypeScript, React Router, TanStack Query, react-hook-form + zod, Tailwind CSS 4, framer-motion, recharts |
| `deploy/` | docker compose service behind Caddy (automatic TLS), `deploy.sh` |

### Our code calculates, the LLM only explains

All results come from deterministic, unit-tested functions in `backend/internal/calc` (money in integer cents):

| Calculation | File |
|---|---|
| Projected yearly income (MAGI) by coverage year | `insurance.go` |
| % of poverty line → applicable % → premium tax credit → net benchmark price, 400% FPL cliff, Medicaid hints | `insurance.go` |
| COBRA = letter amount or KFF average × 102% | `insurance.go` |
| Unemployment weekly benefit, waiting week, max weeks by state | `unemployment.go` |
| Severance net of 22% supplemental, FICA, state withholding | `severance.go` |
| Week-by-week cash runway per insurance option | `runway.go` |
| Deadlines (COBRA election/payment, SEP 60/30 days, OWBPA, FSA, 401k loan) | `deadlines.go` |
| Weekly work-search compliance per state rules + portal record + CSV | `checkin.go` |
| Offer value after benefits, coverage gap, APTC clawback (no repayment cap since 2026) | `offer.go` |
| Tax preview: unemployment and severance tax, subsidy reconciliation | `tax.go` |

The LLM receives numbers already computed by the code and only writes the HR email and explanations. If the provider fails, the UI shows an error and a Retry button; there is no canned fallback text. Limit: 10 calls per case per hour.

### Data sources

Every table in `backend/data/` carries `source` and `asOf`; values not confirmed against an official table are marked `estimate` and shown as such in the UI. The live list is at `GET /api/meta/sources` and on the **How we calculate** page.
HHS poverty guidelines · IRS Rev. Proc. 2025-25 · KFF benchmark premiums and Employer Health Benefits Survey 2026 · CMS default age curve · DOL (COBRA), healthcare.gov (SEP), EEOC (OWBPA), IRS (401k loan offset, APTC repayment caps, 2026 brackets) · state labor departments of MO, TX, MI, CA, FL.

## Run locally

```bash
# API (http://localhost:8080)
cd backend
cp .env.example .env   # optional: Stripe and LLM keys
go test ./...
DB_PATH=sedona.db go run ./cmd/api
```

```bash
# Web (http://localhost:5173)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### Key dependencies and configuration

| Variable | Purpose |
|---|---|
| `FRONTEND_URL`, `FRONTEND_ORIGINS` | Redirect URLs and CORS allow-list |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe test mode. Without a key the built-in test checkout is used (accepts only `4242 4242 4242 4242`, never charges) |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | `anthropic` (official SDK) or an OpenAI-compatible provider: `gemini`, `groq`, `openai` |
| `VITE_API_URL` | Frontend → API base URL |

Secrets live only in the server `.env` and Vercel env, never in git.

## API

Guest sessions: `POST /api/sessions` returns a token (only its SHA-256 hash is stored); send `Authorization: Bearer <token>`.
Main routes: `/cases`, `/cases/sample`, `/cases/{id}/summary`, `/cases/{id}/plan` (402 until paid), `/cases/{id}/calendar.ics`,
`/cases/{id}/checkins`, `/cases/{id}/offers`, `/cases/{id}/tax-preview`, `/cases/{id}/hr-letter`, `/cases/{id}/explain`,
`/cases/{id}/demo/advance` and `/demo/unlock` (sample case only), `/billing/plans`, `/billing/checkout`, `/billing/webhook`, `/billing/status/{id}`.

## Privacy and disclaimer

No SSN, no account numbers, no bank login: only numbers and dates from the quiz. We don't sell insurance or take commissions.

*Educational calculations, not legal, tax or insurance advice. Verify with official sources.*
