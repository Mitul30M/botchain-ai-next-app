<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — botchain-ai-app

## What this project is
BotChain AI: a chat app (Claude-code/ChatGPT-style, multi-chat per user) where users
talk to an AI agent that builds and manages n8n automation workflows on their behalf,
using the n8n-mcp tool server. This repo is the **Next.js frontend** only. The FastAPI
backend, the live n8n-mcp connection, and payment processing do not exist yet — see
"Current phase" and "Deferred work" before writing code outside the frontend.

## Current phase
Only the Next.js app + Auth.js + Neon/Prisma exist. No FastAPI service, no LLM calls,
no live n8n instance, no payment gateway. Don't reach ahead into those unless
explicitly asked to.

## Tooling already in place — use it, don't reinvent it
- **pnpm only.** Never suggest npm or yarn commands.
- Scaffolded with `pnpm create next-app@latest botchain-ai-app --yes`.
- UI kit: shadcn/ui, initialized with
  `pnpm dlx shadcn@latest init --preset b6ZjlcMy0 --template next`.
  The shadcn skill is already installed (`pnpm dlx skills add shadcn/ui`) — use it to
  add new components instead of hand-writing them.
- **Next.js bundled docs**: this install ships version-matched Next.js docs inside
  `node_modules/next`. For any App Router / Next.js API question, consult those over
  training data — they match the exact installed version. Use the running `pnpm dev`
  server's output and error overlay for runtime visibility, and let real errors drive
  fixes rather than guessing at APIs.

## Database & ORM
- One Neon project, one database, default `public` schema — no per-feature databases
  or schemas.
- Prisma 8 is the **only** ORM right now and, pragmatically, owns *every* table for this
  phase. Because auth is handled by Kinde (hosted), there are **no** local
  `Account`/`Session`/`VerificationToken` tables — Kinde manages that state itself.
  Local tables are just:
  - `User` — a thin mirror row keyed on `kindeId` (Kinde's user `sub`), holding
    whatever app-specific fields we need (email cached for convenience, etc.)
  - the app tables: `Chat`, `Message`, `Attachment`, `CreditWallet`,
    `CreditTransaction`, `PaymentTopup` — ported from the `schema.py` already
    generated for the future FastAPI service, referencing `User.id` (or `kindeId`
    directly — pick one and be consistent).
    
- When FastAPI exists later, it will read/write these same tables via SQLAlchemy.
  Migration ownership (stay on Prisma vs. move to Alembic) gets decided then — don't
  pre-solve it now.
- Every schema change goes through `pnpm dlx prisma migrate dev`. Never hand-edit
  tables in the Neon console.
- Use Neon's **pooled** connection string for `DATABASE_URL` (serverless-safe).

## Auth — Kinde
- `@kinde-oss/kinde-auth-nextjs` — hosted auth, not Auth.js/NextAuth. Don't suggest
  next-auth anywhere in this repo.
- Kinde issues its own session cookie and JWT; we do **not** run our own session
  strategy or store sessions locally.
- On a user's first login, sync into our local `User` table (via Kinde's
  `post-user-registration` webhook, or a "get or create" check in a server action on
  first authenticated request — pick one pattern and use it everywhere) and in that
  same step create one `CreditWallet` row and one `CreditTransaction`
  (`type: signup_grant`, `amount: 5.00`). This is the only billing logic that should
  exist in this phase — see below.
- For the future FastAPI backend: verify Kinde's JWT via Kinde's JWKS endpoint
  (standard OIDC public-key verification), not a shared secret — this is simpler than
  the NextAuth JWT-secret-sharing approach and is Kinde's intended pattern for
  resource servers.

## Billing / credits — schema only, no payment wiring yet
- Do implement: `CreditWallet`, `CreditTransaction`, the signup grant above, and any
  UI that reads balance/ledger.
- Do **not** implement yet: Razorpay SDK calls, checkout session creation, or a
  webhook route. `PaymentTopup` can exist in the schema but stays unused.
- If a task seems to need a real top-up flow, stub it (e.g. a disabled "Buy credits"
  button) instead of wiring a live gateway.
- Decision already made for when we do wire it: **Razorpay**, not Stripe — chosen for
  UPI/INR support. Don't re-litigate this later without a reason.

## n8n / n8n-mcp — deferred to the backend phase
- Not needed anywhere in this repo right now.
- An n8n account + `N8N_API_KEY` are only required later, and only for n8n-mcp's 16
  "management" tools (create/update/delete workflows). The 7 "core" tools
  (`search_nodes`, `get_node`, `validate_*`, `search_templates`) work standalone with
  no n8n instance.
- Before creating that account: decide the hosting model — one shared n8n instance
  for all users, or one per user/tenant. That decision determines whether one API key
  or many are needed, and belongs right before backend work starts, not now.

## Backend integration approach (for when FastAPI is built)
`prototype.py` used LangChain + LangGraph (`deepagents`) + Ollama + LangSmith tracing,
with a custom SQLite checkpointer for resumable human-approval interrupts.
`README.md`'s "Claude Project Setup" section assumes something simpler: Claude's
native tool-use loop calling n8n-mcp tools directly, driven by a system prompt.

**Follow the README's approach, not `prototype.py`'s, when that phase starts:**
- Production calls Claude via the Anthropic API directly — the LangChain/Ollama layer
  in the prototype was a prototyping convenience, not a production requirement.
- The Anthropic API supports MCP servers natively (`mcp_servers` param), and n8n-mcp
  already has an HTTP deployment mode — FastAPI can call Claude with n8n-mcp attached
  directly, no LangChain adapter layer needed.
- We already have Postgres-backed `Chat`/`Message` tables for history — don't stand up
  a second, parallel persistence system (LangGraph's SQLite checkpointer) for the same
  job.
- Keep the one genuinely valuable piece of `prototype.py`: the **human-approval gate
  before writing or deploying any workflow** (the n8n-mcp README explicitly warns
  against letting AI touch production workflows unattended). Reimplement it against
  our own state — e.g. a `Message` row with `status: "pending_approval"`, surfaced in
  the UI with approve/reject actions that resume the agent call — instead of LangGraph
  interrupts.
- Use the "Claude Project Setup" instructions from `README.md` (silent execution,
  templates-first, multi-level validation) as the base system prompt once this phase
  starts.

This section describes a future service. Don't start implementing it in this repo.

## Conventions
- Auth is Kinde, full stop — if any generated code, comment, or dependency suggestion
  mentions `next-auth` or `@auth/*`, that's stale and should be removed.
- TypeScript strict mode, App Router, server components by default; `"use client"`
  only where interactivity requires it.
- All Prisma access goes through server actions or route handlers — never call Prisma
  from a client component.
- Ship in small, working slices in this order: DB → auth → chat UI shell. Don't jump
  ahead into backend, billing, or n8n work from this repo.