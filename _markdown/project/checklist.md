# BotChain AI — build checklist

## Phase 0 — Scaffold
- [x] `pnpm create next-app@latest botchain-ai-app --yes`
- [x] `cd botchain-ai-app && pnpm dev` — confirm it boots
- [x] `git init`, first commit, push to GitHub
- [ ] `pnpm dlx shadcn@latest init --preset b6ZjlcMy0 --template next`
- [ ] Drop `AGENTS.md` (below) at repo root
- [ ] Commit

## Phase 1 — Database + ORM (do this now, not later)
- [ ] Create a Neon project, grab both the pooled and direct connection strings
- [ ] `pnpm add prisma @prisma/client && pnpm dlx prisma init`
- [ ] Write `schema.prisma`: a lean `User` mirror table (keyed on Kinde's `kindeId`, no
      `Account`/`Session`/`VerificationToken` — Kinde handles that) **and** the app
      tables (`Chat`, `Message`, `Attachment`, `CreditWallet`, `CreditTransaction`,
      `PaymentTopup`) — port these from the `schema.py` generated earlier, Prisma
      naming conventions
- [ ] `pnpm dlx prisma migrate dev --name init`
- [ ] Confirm tables exist in the Neon dashboard
- [ ] Use the pooled connection string in `DATABASE_URL`

## Phase 2 — Auth (Kinde)
- [ ] Create a Kinde account/app, grab client id/secret + issuer URL
- [ ] `pnpm add @kinde-oss/kinde-auth-nextjs`
- [ ] Wire the Kinde callback route + env vars, add sign-in/sign-out buttons
- [ ] On first login: sync into local `User` table, insert `CreditWallet` + a
      `signup_grant` `CreditTransaction` of $5.00 (via Kinde's
      `post-user-registration` webhook, or a get-or-create check on first
      authenticated request)
- [ ] Middleware to protect authenticated routes
- [ ] Test the full login → session → protected page loop

## Phase 3 — Chat UI shell (frontend only, real DB, no LLM yet)
- [ ] Sidebar: list chats per user
- [ ] New chat / rename / soft-delete (`deletedAt`)
- [ ] Message thread UI (LLM responses can be stubbed/mocked for now)
- [ ] Wallet balance display (read-only from `CreditWallet`)

## Phase 4 — Deferred (do not start yet)
- [ ] Decide n8n hosting model (shared instance vs. per-user) — only then create the n8n account and `N8N_API_KEY`
- [ ] Build the FastAPI backend repo (Railway), Anthropic API + n8n-mcp wired natively — see AGENTS.md "Backend integration approach"
- [ ] Human-approval gate for any workflow write, backed by your own `Message.status`, not LangGraph interrupts
- [ ] Real credit deduction tied to actual LLM token usage
- [ ] Razorpay checkout + webhook (schema already exists, unused until this step)
- [ ] Docker + GitHub Actions CI/CD for both repos