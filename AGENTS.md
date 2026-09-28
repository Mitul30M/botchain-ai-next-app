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
backend lives in a separate repo (`../botchain-ai`) and is **read-only** from here —
never edit it to make a frontend problem go away. Payment processing still does not
exist — see "Billing / credits" before writing code outside the frontend.

## Current phase
Next.js app + Kinde + Neon/Prisma, talking to the live FastAPI backend over
`fetchBackend` (`lib/backend.ts`). Chat and message data is owned by the backend; this
repo reads the chat list via Prisma and sends every chat/message mutation to the
backend. No live n8n instance, no payment gateway. Don't reach ahead into those unless
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
- **Ownership is split.** The FastAPI backend owns `chats`, `messages`, `attachments`,
  and the LangGraph checkpoint/thread state. This repo must only ever **read** those
  through Prisma (the chat list and chat cards) and **write** them by calling the
  backend. Never `prisma.orm.public.Chat.create/update/delete` — it will drift from
  the backend's rows and bypass the ownership check.
- Prisma is the **only** ORM from this repo, and owns `users`, `credit_wallets`, and
  `credit_transactions`. Because auth is handled by Kinde (hosted), there are **no**
  local `Account`/`Session`/`VerificationToken` tables — Kinde manages that state.
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
- Prisma 8 (the RC) is not Prisma 5/6. `db.orm.public.Model.where(fn).delete()` is the
  delete form and resolves to the removed row or `null`; a mutation without `.where()`
  is a type error. Confirm syntax in `.agents/skills/prisma-8/` or the generated
  `src/prisma/contract.d.ts` rather than guessing, and never fall back to raw SQL
  without asking.

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

## Account deletion
`KINDE_DELETE_MODE` is **local-only** (`lib/account-lifecycle.ts` — the mode and its
user-facing copy live together so the dialog can't describe something the action
doesn't do).

`deleteAccountAction` in `src/app/users/[userId]/actions.ts` runs in this order, and
the order is the whole design:
1. Resolve the Kinde session, then the local user via `getUser`. No session or no
   local row → `redirect("/api/auth/logout")`.
2. Re-verify the typed confirmation against the user's email **on the server**. The
   disabled button in the dialog is a convenience, not the check.
3. `fetchBackend("/api/v1/me/data", { method: "DELETE" })`. On any failure (409, 5xx,
   backend down) **stop and return the error** — the local row must survive so the
   user can retry.
4. Delete the `users` row with Prisma by `id`.
5. `local-only` stops here; the Kinde identity is intentionally retained, so signing in
   again mints a fresh empty account via `/api/auth/sync`.
6. `redirect("/api/auth/logout")` — last, because the `/users/[userId]` layout and
   `/api/auth/sync` both key off that row and would otherwise rebuild it.

Notes worth keeping:
- `redirect()` throws. Never wrap it in a `try`/`catch` that swallows it.
- Never call `getUser`/sync after step 4, or the account reappears.
- **Never smoke-test this on a real account.** Use a throwaway Kinde signup, and only
  with the backend running.
- `full` mode (delete the Kinde identity too) is **not** implemented. It needs a Kinde
  M2M application, `@kinde/management-api-js`, and the package's real env var names —
  don't guess them.

## Chat rename & delete
`renameChatAction` / `deleteChatAction` in
`src/app/users/[userId]/chats/actions.ts`; UI in `chat-card-menu.tsx`, shared by the
chat list and the in-chat header.
- Rename mirrors the backend's 120-char limit locally, but the backend's 422 `detail`
  is what the user sees if they disagree.
- Delete treats **404 as success** (already gone) and surfaces a **409** `detail`
  verbatim, so "a run is still streaming" reads as a wait rather than a breakage.
- Every action re-authenticates from the session. A `userId` route param is for URLs
  only — never an authorization input.

## Server-only data helpers vs. Server Functions
`lib/user.ts` is `import "server-only"`, **not** `"use server"`. A top-of-file
`"use server"` turns *every* export into a publicly callable endpoint, and `getUser`
takes an arbitrary id and returns email, chats, and wallet with no auth of its own.
Callers must resolve the Kinde session first and pass the session's own `sub`.

In a `"use server"` file, **only async functions may be exported** — a shared constant
will fail the production build with *"Only async functions are allowed to be exported"*,
which `tsc` and ESLint do not catch. Shared constants go in a plain module:
`lib/chat-limits.ts`, `lib/account-lifecycle.ts`.

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
- `pnpm build` is the real gate, not `tsc`/ESLint: the `"use server"` export rule and
  several bundler-only errors are invisible until it runs. Expect `pnpm lint` to report
  pre-existing problems in generated files (`src/prisma/contract.d.ts`,
  `.agents/skills/**`, `components/ai-elements/*`) — check *your* files, not the total.
- Ship in small, working slices in this order: DB → auth → chat UI shell. Don't jump
  ahead into backend, billing, or n8n work from this repo.