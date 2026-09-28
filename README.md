# BotChain AI — Frontend

The Next.js frontend for **BotChain AI**: a chat app where a user describes an
automation in plain language and an agent builds and manages the corresponding
[n8n](https://n8n.io) workflow, through the `n8n-mcp` tool server.

> **Scope note.** This repository is the frontend only. The FastAPI backend that
> owns the agent loop, the Anthropic calls, and the n8n tool execution lives in a
> separate repository (`../botchain-ai`) and is read-only from here. Chat and
> message rows are **owned by the backend** — this app reads them through Prisma
> and sends every mutation over HTTP. See
> [Data ownership](#data-ownership) for the rules that follow from that.

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running the app](#running-the-app)
- [Project structure](#project-structure)
- [Architecture](#architecture)
  - [Data ownership](#data-ownership)
  - [Authentication and first-login sync](#authentication-and-first-login-sync)
  - [The backend boundary](#the-backend-boundary)
  - [Streaming](#streaming)
- [Database](#database)
- [Credits and billing](#credits-and-billing)
- [Account deletion](#account-deletion)
- [UI conventions](#ui-conventions)
- [Development workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Not built yet](#not-built-yet)

## What it does

- A marketing landing page at `/` with an animated, self-replaying sample
  conversation that demonstrates the request → plan → approval loop.
- A per-user dashboard listing chats, recent activity, and a danger zone for
  account deletion.
- A chat view with streaming agent responses, an approval gate for proposed
  workflow changes, and attachment downloads.
- Rename and delete for chats, with backend error text surfaced verbatim.

## Stack

| Concern          | Choice                                                   |
| ---------------- | -------------------------------------------------------- |
| Framework        | Next.js 16 (App Router, React 19, Turbopack)              |
| Language         | TypeScript, `strict`                                      |
| UI kit           | shadcn/ui, `base-mira` preset, Base UI primitives         |
| Styling          | Tailwind CSS v4, mauve base color, `next-themes` for dark |
| Auth             | Kinde (`@kinde-oss/kinde-auth-nextjs`)                    |
| Database         | Neon Postgres, accessed with Prisma 8 (RC)                |
| Charts / streams | Recharts, `streamdown`, AI SDK                            |
| Package manager  | **pnpm** (12.4.2) — npm and yarn are not used            |

`pnpm` is the only supported package manager. CI and local tooling assume the
lockfile in this repo.

## Prerequisites

- **Node.js 20+** and **pnpm 12+**
- A **Neon** project (the pooled connection string is `DATABASE_URL`)
- A **Kinde** application with this project registered as a web app
- Optionally, a running checkout of the FastAPI backend (`../botchain-ai`) —
  the app degrades gracefully without it, but chat and approval features will
  error.

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create the environment file
cp _env-example.txt .env.local
# then fill in the values — see the table below

# 3. Apply the database schema
pnpm dlx prisma migrate dev

# 4. Start the dev server
pnpm dev
```

The app is served at [http://localhost:3000](http://localhost:3000).

### Kinde callback URLs

Configure these in the Kinde dashboard so login and logout round-trip correctly:

| Purpose                        | URL                                          |
| ------------------------------ | -------------------------------------------- |
| Post login redirect            | `http://localhost:3000/api/auth/sync`        |
| Post logout redirect           | `http://localhost:3000`                      |
| Allowed sign-in / sign-out URIs | `http://localhost:3000/api/auth/*`           |

`/api/auth/sync` is the post-login landing spot: it creates the local user row
if needed, then redirects to `/users/{id}/chats`.

## Environment variables

All variables live in `.env.local`. Never commit this file.

| Variable                        | Required | Notes                                                                                   |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | yes      | **Pooled** Neon connection string. This is the default for all app queries.                |
| `DIRECT_URL`                    | yes      | Unpooled string, used for migrations.                                                     |
| `DATABASE_URL_UNPOOLED`         | yes      | Same value as `DIRECT_URL`.                                                              |
| `NEON_BRANCH`                   | yes      | e.g. `production`.                                                                        |
| `KINDE_CLIENT_ID`               | yes      | Kinde application client ID.                                                              |
| `KINDE_CLIENT_SECRET`           | yes      | Kinde application client secret.                                                          |
| `KINDE_ISSUER_URL`              | yes      | Kinde tenant issuer, e.g. `https://<tenant>.kinde.com`.                                   |
| `KINDE_SITE_URL`                | yes      | This app's base URL, e.g. `http://localhost:3000`.                                        |
| `KINDE_POST_LOGIN_REDIRECT_URL` | yes      | Point at `/api/auth/sync` so a first-time user is provisioned.                            |
| `KINDE_POST_LOGOUT_REDIRECT_URL`| yes      | Point at `/`.                                                                              |
| `BACKEND_URL`                   | yes      | FastAPI base URL, e.g. `http://127.0.0.1:8000`. **Server-side only** — never expose it.   |

## Running the app

```bash
pnpm dev            # dev server with Turbopack
pnpm build          # production build
pnpm start          # serve the production build
pnpm lint           # eslint across the repo
pnpm contract:emit  # regenerate src/prisma/contract.d.ts from the schema
```

**`pnpm build` is the real gate**, not `tsc` or ESLint alone. The most important
rule it enforces that the others miss:

> In a file with a top-of-file `"use server"`, **only async functions may be
> exported**. A shared constant fails the production build with *"Only async
> functions are allowed to be exported"* while `tsc` and ESLint both pass.

## Project structure

```
src/
├── app/
│   ├── layout.tsx                     # root layout, ThemeProvider, font vars
│   ├── page.tsx                       # marketing landing page
│   ├── api/
│   │   ├── auth/[kindeAuth]/route.ts  # Kinde catch-all (login/logout/refresh)
│   │   ├── auth/sync/route.ts         # post-login user provisioning
│   │   ├── chat/route.ts              # streaming a new message to the backend
│   │   └── chats/[chatId]/            # approve/reject, messages, attachment download
│   ├── prisma/                        # contract.prisma, generated client, db.ts
│   └── users/[userId]/                # authenticated area (guarded by its layout)
│       ├── page.tsx                   # dashboard
│       ├── actions.ts                 # deleteAccountAction
│       └── chats/
│           ├── page.tsx               # full chat list
│           ├── actions.ts             # create / rename / delete chat
│           ├── chat-card-menu.tsx     # per-chat overflow menu
│           ├── chat-list-item.tsx     # shared dashboard row
│           ├── more-chats.tsx         # "show N more" collapsible
│           └── [chatId]/              # chat view + approval gate
├── prisma/                            # db.ts, contract.prisma, contract.d.ts
components/
├── ui/                                # shadcn primitives
├── ai-elements/                       # AI SDK chat primitives
├── landing/live-session.tsx           # animated landing-page demo
├── mode-toggle.tsx                    # light / dark / system
└── theme-provider.tsx                 # next-themes wrapper
lib/
├── backend.ts                         # fetchBackend, streamThrough, error types
├── prisma.ts                          # re-export of the Prisma client
├── user.ts                            # server-only user lookup
├── sse.ts                             # text/event-stream reader
├── dates.ts                           # Temporal-safe date conversion
├── chat-limits.ts                     # shared chat contract constants
├── account-lifecycle.ts               # delete mode + its user-facing copy
└── chat-types.ts                      # wire types mirroring backend schemas
```

Two conventions are load-bearing and easy to get wrong:

- **Aliases resolve from the repo root.** `tsconfig.json` maps `@/*` to `./*`, so
  `@/components/ui/button` means `<root>/components/ui/button`. The `components/`
  and `lib/` directories are at the root, not under `src/`. Only `src/app` and
  `src/prisma` live inside `src/`.
- **Shared constants cannot live in a `"use server"` file.** See
  `lib/chat-limits.ts` and `lib/account-lifecycle.ts` for the two places this
  matters and why the copy lives next to the mode it describes.

## Architecture

### Data ownership

The split is deliberate and enforced by convention:

| Table(s)                              | Owner      | This app may                          |
| ------------------------------------- | ---------- | ------------------------------------- |
| `chats`, `messages`, `attachments`     | Backend    | **Read** via Prisma, **write** via HTTP |
| `users`                               | This app   | Full read/write                       |
| `credit_wallets`, `credit_transactions`| This app  | Full read/write                       |
| `payment_topups`                      | Nobody yet | Schema only, unused                   |

Never call `prisma.orm.public.Chat.create/update/delete` from this repo. Those
rows are written by the backend, and a local write would drift from its state and
bypass the backend's authorization check.

The Prisma schema (`src/prisma/contract.prisma`) was ported from the backend's
SQLModel `schema.py`, with every column pinned to the **exact snake_case name**
SQLAlchemy already uses via `@map`. That way, when the backend takes over, both
ORMs point at the same physical columns and no rename migration is needed on
handoff.

### Authentication and first-login sync

Auth is Kinde, fully hosted. There is no local session table, no `Account` /
`Session` / `VerificationToken` rows, and no `next-auth` anywhere — if you see a
suggestion involving it, it is stale.

`proxy.ts` wraps the app in Kinde's `withAuth` and treats only `/` as public. The
authenticated tree is guarded again, per-request, by
`src/app/users/[userId]/layout.tsx`, which compares the route's `userId` against
the local row belonging to the current session's `sub` and redirects home on a
mismatch.

Provisioning happens in `GET /api/auth/sync`, which runs after login. In one
transaction it creates the `User` row, a `CreditWallet` with a 5.00 balance, and
a `CreditTransaction` of type `signup_grant`. It then redirects to
`/users/{id}/chats`.

### The backend boundary

All backend traffic goes through `lib/backend.ts`:

- `getBackendUrl()` — reads `BACKEND_URL`, trailing-slash tolerant.
- `getAccessToken()` — the signed-in user's raw Kinde JWT.
- `fetchBackend<T>()` — authenticated JSON request; throws `BackendError` with
  the status and the backend's `detail` string, or `BackendUnavailableError`
  when `BACKEND_URL` is unset.
- `streamThrough()` — pipes a backend `text/event-stream` response straight to
  the browser.

`BackendError.detail` is surfaced to the user **verbatim** on purpose. A 409 from
`DELETE /api/v1/chats/{id}` reads "a run is still streaming", which is a wait
rather than a breakage — paraphrasing it would turn a correct message into a
scary one.

`BACKEND_URL` and the access token are server-side only. Route handlers and
server actions are the only places they may appear.

### Streaming

Two paths, deliberately different:

- **New message** (`POST /api/chat`) streams the backend response straight into
  `useChat`, which parses it natively. `maxDuration` is raised to 300s because
  an agent build can run for minutes and Vercel otherwise caps at 300s anyway.
- **Approve / reject continuation** has no `useChat` continuation to attach to,
  so `lib/sse.ts` re-reads the same wire format on the client.

Both send the same `Authorization: Bearer <kinde jwt>`; the backend verifies it
via Kinde's JWKS endpoint.

## Database

- One Neon project, one database, default `public` schema.
- `DATABASE_URL` must be the **pooled** string; migrations use `DIRECT_URL`.
- Prisma 8 (an RC) is wired through `src/prisma/db.ts` with a generated contract
  rather than the older `schema.prisma` + `@prisma/client` pair.
- Schema changes go through `pnpm dlx prisma migrate dev`, then
  `pnpm contract:emit` to refresh the generated types. Never hand-edit tables in
  the Neon console.
- Confirm Prisma 8 syntax against `src/prisma/contract.d.ts` or
  `.agents/skills/prisma-8/`. It is not Prisma 5/6: deletes are
  `Model.where(fn).delete()`, and a mutation without a `.where()` is a type
  error.

Timestamps come back from the Postgres `temporal` codec as `Temporal.Instant`,
which cannot be passed to `new Date()` directly. Always convert via
`toDate()` / `formatDate()` from `lib/dates.ts` — using a timestamp raw will
throw `TypeError: Cannot use valueOf`.

## Credits and billing

The **schema** for credits is complete; the payment flow is not.

- New accounts receive 5.00 credits via the `signup_grant` transaction created
  during sync.
- `CreditWallet` is a cached balance; `CreditTransaction` is the append-only
  source of truth. Update both in the same transaction.
- `PaymentTopup` exists in the schema and is unused.

There is no Razorpay SDK call, no checkout session, and no payment webhook in
this repo. UI that would need one shows a disabled or stubbed control instead.
**Razorpay** (not Stripe) is the decided provider for when wiring begins, chosen
for UPI and INR support.

## Account deletion

`deleteAccountAction` (`src/app/users/[userId]/actions.ts`) is `local-only`.
The ordering is the whole design:

1. Resolve the Kinde session, then the local user. No session or no row →
   redirect to `/api/auth/logout`.
2. Re-verify the typed confirmation against the user's email **on the server**.
   The disabled button in the dialog is a convenience, not the check.
3. `DELETE /api/v1/me/data` on the backend. **Any** failure (409, 5xx, backend
   down) stops and returns the error, so the local row survives and the user can
   retry.
4. Delete the `users` row.
5. Stop. The Kinde identity is intentionally retained, so signing in again mints
   a fresh empty account through `/api/auth/sync`.
6. `redirect("/api/auth/logout")` last, because the layout and `/api/auth/sync`
   both key off the row that was just deleted.

`KINDE_DELETE_MODE` is the mode flag and the user-facing copy live together in
`lib/account-lifecycle.ts`, so the dialog can never describe something the action
does not do. (`KIND_E_DELETE_MODE` is the current constant name — the typo is
real, change it only if you are willing to update every caller.)

Two rules that bite:

- **`redirect()` throws.** Never wrap it in a `try`/`catch` that swallows it; the
  user would see a silent success.
- **Never smoke-test this on a real account.** Use a throwaway Kinde signup, and
  only with the backend running.

## UI conventions

- shadcn/ui components over hand-rolled markup. Add new ones with
  `pnpm dlx shadcn@latest add <component>` rather than writing them by hand.
- **Semantic tokens only** — `bg-background`, `text-muted-foreground`,
  `border-border`. No hardcoded colors and no `bg-blue-500`. The mauve chart
  scale (`chart-1` … `chart-5`) is the accent palette.
- **`@/components/**` and `@/lib/**` resolve from the repo root**, not `src/`.
- `"use client"` only where interactivity requires it; server components by
  default.
- All Prisma access happens in server actions or route handlers — never from a
  client component.
- Icons inside components use `data-icon="inline-start" | "inline-end"` rather
  than sizing classes.
- `next-themes` writes the theme to `<html>` as a class; `globals.css` already
  defines the `.dark` palette.

## Development workflow

```bash
# 1. Read the bundled, version-matched Next.js docs first
node_modules/next/dist/docs/

# 2. Type-check
pnpm exec tsc --noEmit

# 3. Lint only the files you touched
pnpm exec eslint "src/app/users/[userId]/"

# 4. The real gate
pnpm build
```

`pnpm lint` is repo-wide and currently reports **pre-existing** problems in
generated and vendored files (`src/prisma/contract.d.ts`, `.agents/skills/**`,
`components/ai-elements/*`). Read the file list, check *your* files, ignore the
total. `AGENTS.md` is regenerated by `next dev` and rewritten on each run —
leaving it out of a commit just re-creates the diff.

## Troubleshooting

**`Only async functions are allowed to be exported`**
A `"use server"` file is exporting a constant or type. Move the shared value to a
plain module (`lib/chat-limits.ts`, `lib/account-lifecycle.ts`). `tsc` and
ESLint will not catch this; only `pnpm build` will.

**`Cannot use valueOf` when rendering a date**
A `Temporal.Instant` reached `new Date()` directly. Use `toDate()` / `formatDate()`
from `lib/dates.ts`.

**`/users/...` redirects to `/` immediately after login**
The post-login redirect is not pointing at `/api/auth/sync`, so the local `User`
row was never created. Check `KINDE_POST_LOGIN_REDIRECT_URL`.

**A 404 on a chat that should exist**
The chat list is a read of the backend's rows. Confirm the backend is running and
that `BACKEND_URL` resolves, then check the chat is not soft-deleted
(`deleted_at`).

**`BackendUnavailableError: BACKEND_URL is not set`**
Missing from `.env.local`. Copy it from `_env-example.txt`.

**Stale content in the chat list**
The dashboard reads through Prisma and the backend owns those rows. A rename from
another client will not appear until the next full page load.

## Known limitations

- Account deletion cannot be smoke-tested in CI — it needs a live Kinde tenant
  and a running backend.
- Repo-wide `pnpm lint` fails on generated files; scope it to your own files.
- `KIND_E_DELETE_MODE` contains a typo and is exported to every caller that cares
  about the delete mode.
- Authenticated pages cannot be verified with a bare `curl` — they 307 to login.
  Route-level checks only prove compilation.

## Not built yet

Deliberately absent, and not to be started from this repo without an explicit
ask:

- **Payment processing.** No Razorpay wiring, checkout, or webhook.
- **The agent itself.** Anthropic calls, the tool loop, and n8n-mcp execution all
  belong to the FastAPI service.
- **A live n8n instance.** Only needed for n8n-mcp's 16 "management" tools; the 7
  "core" tools work without one. The single-instance-vs-per-tenant decision is
  still open and should be made right before backend work starts, since it
  determines whether one API key or many are needed.
- **Full-mode account deletion** (removing the Kinde identity too). That needs a
  Kinde M2M application and `@kinde/management-api-js`.
