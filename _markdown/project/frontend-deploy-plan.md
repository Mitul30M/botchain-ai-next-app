# Frontend deploy plan — Next.js app to Railway as a stateful server

**Read me first:** this file is the deployment plan for `botchain-ai-next-app`

**Host decision (settled):** Railway, **stateful Node server**, *not* Vercel serverless.
The code already reflects that choice — `export const maxDuration = 300` exists on both
streaming routes with a comment explaining it exists because "Vercel otherwise caps a
function at 300s anyway." That ceiling is the reason we are *not* on Vercel: an agent build
streams for minutes, and a hard 300s kill mid-stream truncates exactly the long Phase-5
builds this product depends on. On a long-lived Node process there is no such ceiling.

---

## 1. Where we are (verified against the actual repo, not assumed)

- `next.config.ts` is the Create-Next-App stub with **no** `output: "standalone"`:
  ```ts
  const nextConfig: NextConfig = { /* config options here */ };
  ```
  **This is the single blocker.** Everything below is packaging around it.
- **There is no deploy configuration of any kind** — no `Dockerfile`, no `vercel.json`,
  no `railway.json`, no `fly.toml`, no `render.yaml`, no `.github/workflows`, no `.vercel`.
  Verified absent, not "not found."
- `BACKEND_URL=http://127.0.0.1:8000` — the frontend has only ever talked to a local backend.
- Toolchain: `packageManager: pnpm@12.4.2` (**pnpm, not npm**), `next@16.3.5`,
  `react@19.2.8`, `@prisma/orm-postgres@8.0.0-rc.11`, `prisma@8.0.0-rc.15`.
  `next` declares `engines.node >= 20.9.0`; local is v25.9.0.
- There is **no `.node-version` / `.nvmrc` / `engines` field** — the image's Node version
  is currently undefined by the project. Pin one (recommend **Node 22 LTS**).
- `public/` exists (5 default SVGs) and must be copied into the image.
- **No `.dockerignore`** — must be created. Without it the whole `.next/`, `.git/`,
  `node_modules/` and `.env.local` ship into the build context. `.env.local` contains real
  credentials, so this is also a leak risk, not just a size problem.

### 1.1 The good news: the backend is already fully compatible

Verified in this planning pass — the frontend needs **zero backend code changes**:

- **CORS is a non-issue.** All four files touching `BACKEND_URL` are server-side
  (`lib/backend.ts` + three `route.ts` handlers). No `"use client"` anywhere near it, no
  `NEXT_PUBLIC_*` variable in the entire app. The browser never calls FastAPI, so
  `CORS_ORIGINS` can stay unset on Railway without breaking anything. (This corrects an
  earlier claim in the backend README/AGENTS.md that unset CORS "blocks the browser.")
- **Every request body matches the backend schema exactly:**

  | Frontend sends | Backend schema | Match |
  |---|---|---|
  | `{ content }` | `MessageCreate{content: str, parent_id: str\|None = None}` | `parent_id` correctly omitted |
  | `{ approved, feedback? }` | `ApproveRequest{approved: bool = True, feedback: str\|None, max_length=2000}` | matches, incl. the 2000 cap mirrored client-side |
  | `{}` | `ChatCreate{title: None, model: None}` | both optional |
  | `{ title: trimmed }` | `ChatUpdate{title: 1..120, strip, non-empty}` | `CHAT_TITLE_MAX_LENGTH` mirrors the 120 cap |

- **Chats are created through the backend**, not Prisma — deliberately, so `Chat.model`
  gets the real model name (`ministral-14b-latest`) rather than the DB's
  `claude-sonnet-4-6` placeholder. `services/pricing.py` resolves `credits_cost` from
  `Chat.model`, so this path matters for billing accuracy. Do not "optimise" it to a
  direct Prisma insert.
- Streaming is byte-for-byte pass-through: `lib/backend.ts:streamThrough()` re-emits
  backend stream headers verbatim and never buffers the body. `useChat` sees exactly what
  FastAPI produced.

### 1.2 Neon state — two changes required before deploy

Both are on endpoint `ep-rapid-rain-b39k8bgv` (project `billowing-snow-05570527`, branch
`br-aged-sunset-b39a2u2u`):

1. **`pooler_enabled: false` today, and the frontend's `DATABASE_URL` points at the
   `-pooler` host.** As written, the frontend cannot connect. Enable the pooler
   (`pooler_mode: transaction`) or point the frontend at the unpooled host. Enabling it is
   preferred — serverless-flavoured pooled connections are the right call for many
   short-lived clients, and it leaves `DIRECT_URL` available for migrations.
2. **`suspend_timeout_seconds: 0`** — auto-suspend is disabled, so the database bills
   24/7 even with both apps paused. Set to `300`. Accept a sub-second cold start on the
   first request after 5 idle minutes; given builds take minutes, this is invisible in
   practice and it is the single biggest credit lever available.

> These are Neon-side changes, made from the backend repo's Neon access. Do them before the
> first frontend deploy, not during it.

---

## 2. Step 1 — `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

`output: "standalone"` emits `.next/standalone/` with a self-contained `server.js` plus a
minimal `node_modules` — the server does **not** need the full dependency tree or pnpm at
runtime. This is what makes a slim image possible. Keep it otherwise empty; do not add
`output: "export"` (the app has API routes and server actions and would break).

## 3. Step 2 — remove the Vercel-only ceiling

Both streaming routes set `maxDuration = 300`:

- `src/app/api/chat/route.ts`
- `src/app/api/chats/[chatId]/approve/route.ts`

On a stateful Node process this export is **inert** — no platform enforces it. Delete it
and its comment, or the next reader will assume a 300s limit still exists and design around
a constraint that is no longer real. If any future deploy target *is* serverless, it must
be re-added there (with a comment saying why) rather than living here permanently.

Also: with SSE, confirm the response is not buffered by any middleware. The backend already
sends `x-accel-buffering: no` and `Cache-Control: no-transform`; `streamThrough()` preserves
both.

## 4. Step 3 — `.dockerignore`

```
node_modules
.next
.git
.gitignore
.env
.env.*
!.env.example
npm-debug.log*
README.md
_markdown
*.tsbuildinfo
.DS_Store
.vercel
```

Two deliberate exclusions from that ignore list, both load-bearing:

- **Do not ignore `src/prisma/`.** Prisma 8 contract mode ships `contract.json` +
  `contract.d.ts` as **committed source** (verified: not gitignored). `src/prisma/db.ts`
  imports `contract.json` at module load. Excluding the directory produces a build that
  compiles and then throws at runtime — the worst possible failure mode.
- **Do not ignore `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `.npmrc`.** `pnpm-workspace.yaml`
  carries the `allowBuilds` allowlist (esbuild, msgpackr-extract, workerd) and `.npmrc`
  carries the matching `onlyBuiltDependencies`. Dropping either makes native deps silently
  unbuildable.

Keep `.env*` ignored — `.env.local` holds live Neon and Kinde credentials. Runtime env
comes from the platform, never from the image.

## 5. Step 4 — `Dockerfile`

Multi-stage, **pnpm via corepack** (not npm — that would resolve a different tree than
`pnpm-lock.yaml` and is a silent-divergence trap).

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- deps: install with the lockfile, no scripts -------------------------------------
FROM base AS deps
WORKDIR /app
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- build --------------------------------------------------------------------------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build evaluates route modules; several import the Prisma client, so the
# connection env must exist at build time or module init throws.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build
ENV KINDE_CLIENT_ID=build
ENV KINDE_CLIENT_SECRET=build
ENV KINDE_ISSUER_URL=https://build.invalid
ENV KINDE_SITE_URL=http://localhost:3000
ENV KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000/api/auth/sync
ENV KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
ENV BACKEND_URL=http://127.0.0.1:8000
RUN pnpm build

# ---- runtime: standalone output only -------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Notes on the choices, since they are the ones that will bite:

- **`node:22-bookworm-slim`, not Alpine (musl).** The dep tree includes `sharp`,
  `rive-app`, and `@xyflow/react`; Alpine's musl libc means different native binaries or a
  libc-compat layer. Slim keeps glibc and avoids an entire class of runtime segfaults.
- **Placeholder env in the build stage is mandatory, not optional.** `src/prisma/db.ts`
  does `postgres({ contractJson, url: process.env['DATABASE_URL']! })` at **module scope**,
  and the non-null assertion is a compile-time-only claim. With `DATABASE_URL` undefined,
  importing that module during `next build` throws. The values are throwaway and are never
  baked into the runtime stage — the runner stage copies only `public/`, `.next/standalone`,
  and `.next/static`, and every real value is injected by the platform at run time.
  If a build ever fails with a Prisma/connection error here, this is the first thing to check.
- **`--ignore-scripts` in deps, real postinstall in build.** The `postinstall` hook is
  `prisma skills sync || exit 0` — already failure-tolerant, so it is safe to run in the
  build stage where the schema is present.
- **Never copy the whole `/app` into the runner.** `standalone` exists precisely so the
  image is a `server.js` plus static assets. Copying everything reintroduces the full
  `node_modules` and bloats the image by hundreds of MB.
- The runner needs **no pnpm** — `server.js` is plain Node. `corepack` is inherited from
  `base` but unused there, which is harmless.

Verify before shipping: `docker build -t frontend:test .` then
`docker run --rm -p 3000:3000 -e DATABASE_URL=… frontend:test` and confirm
`/_next/static` assets are served (a missing `.next/static` copy produces a page that
renders HTML with no CSS and a wall of 404s in the console — the classic standalone
packaging bug).

## 6. Step 5 — Railway service

New service in the **existing** project (`graceful-creation`), alongside the backend.

| Setting | Value | Why |
|---|---|---|
| Builder | **Dockerfile** | §5 |
| Dockerfile path | `Dockerfile` | repo root |
| Root directory | `.` | |
| Region | same as the Neon branch (`aws-ap-southeast-1`) | keeps DB latency low |
| Replicas | 1 | sufficient; no server state to share |
| Healthcheck path | `/` | must be 200 for the domain to route |

**Port — the one that already cost the backend an incident.** Railway injects `PORT` (the
backend project uses `8080`). The image honours `$PORT` via `ENV PORT=3000` overridden at
run time and `HOSTNAME=0.0.0.0`. The service's **target port must match the injected
`PORT` exactly**. A mismatch does not degrade — Railway's edge returns a hard
`502`/`404 Application not found` while the container is perfectly healthy, and
`/health`-style checks inside the container keep passing, so it looks like an app bug when
it is a routing bug. After creating the domain, confirm the port mapping in the Railway
dashboard before declaring success.

## 7. Step 6 — environment variables

All on the **frontend** service, all set as **sealed** values in the Railway dashboard.
Never import `.env.local`; never bake secrets into the image.

| Var | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** host (`…-pooler.…`) — serverless-style |
| `DIRECT_URL` | Neon **unpooled** host |
| `BACKEND_URL` | `https://botchain-ai-production.up.railway.app` (**no** trailing slash — `getBackendUrl()` strips it anyway) |
| `KINDE_CLIENT_ID` | from the Kinde dashboard |
| `KINDE_CLIENT_SECRET` | from the Kinde dashboard |
| `KINDE_ISSUER_URL` | `https://mitul30m.kinde.com` (same tenant the backend verifies) |
| `KINDE_SITE_URL` | the frontend's public origin |
| `KINDE_POST_LOGIN_REDIRECT_URL` | `<origin>/api/auth/sync` |
| `KINDE_POST_LOGOUT_REDIRECT_URL` | `<origin>` |

Two that are easy to miss:

- **`KINDE_SITE_URL` is used for server-side calls to the Kinde Management API** during
  token exchange, and it must be the **public** origin — not `localhost`. If it is wrong,
  sign-in fails with an opaque issuer-mismatch error rather than anything obviously
  "wrong URL".
- **`KINDE_ISSUER_URL` must be the same tenant the backend verifies against.** The backend
  rejects any token whose issuer does not match its own `KINDE_ISSUER_URL`; a mismatch
  surfaces as a `401` from the backend on a token the frontend considers perfectly valid.

## 8. Step 7 — Kinde dashboard

The app is currently registered for `http://localhost:3000/api/auth/*` only. Add the
production equivalents for:

- Allowed sign-in / sign-up redirect URIs
- Allowed post-logout redirect URIs
- Allowed web origins

Login will fail at the Kinde redirect step until these exist, and the error will look like
a Kinde misconfiguration rather than a missing app setting.

## 9. Step 8 — the backend resume

The backend service is currently **paused** (deliberately, to conserve trial credits), which
is why `https://botchain-ai-production.up.railway.app` returns
`404 {"message":"Application not found"}` with `x-railway-fallback: true` on every path
including `/health`. That is Railway removing routing for a paused service — **not** an app
crash, and not something the code caused. A crash surfaces as `502`; a paused service
surfaces as `404` + `x-railway-fallback`.

To resume, in order:

1. Un-pause the backend service.
2. **Re-verify the domain's target port is still `8080`.** Pausing/detaching is the prime
   suspect for a lost port mapping. Railway injects `PORT=8080`; the `CMD` honours it via
   `--port ${PORT:-8000}`.
3. `GET /health` → `200 {"status":"ok"}`
4. `GET /openapi.json` → `200`
5. Authenticated `GET /api/v1/chats` with a real Kinde token → `200` against production Neon
6. Expect the **first** request to be slow (~1s) while Neon wakes from auto-suspend. Not a
   failure.

## 10. Step 9 — joint smoke test

The actual goal: both deployments working together, in this order.

1. Load the frontend → no console errors, CSS applied (proves `.next/static` copied)
2. Sign in with Kinde → lands on the dashboard (proves all four `KINDE_*` values)
3. Dashboard loads the chat list (proves `DATABASE_URL` + Prisma contract mode)
4. Create a chat → redirected to `/users/{id}/chats/{chatId}` (proves backend `POST /chats`)
5. Send a message → watch live status heartbeats, then streamed text (proves the full
   proxy chain and that nothing buffers)
6. Reach the confirm gate → Approve → **let the build run to completion.** This is the
   step Vercel would have truncated. Expect minutes, not seconds.
7. Download `workflow.json` from the assistant message (proves attachments + the download
   proxy route)
8. Rename a chat, then delete it
9. `DELETE /me/data` → account purge succeeds, then Kinde logout
10. Confirm the chat list is empty afterwards

## 11. Security follow-ups (do these regardless of deploy outcome)

- **Rotate the Railway project token.** A live project token was pasted into a chat
  transcript during the backend deploy. It now governs **both** services. Regenerate it in
  the Railway dashboard, then update `RAILWAY_TOKEN` in the GitHub **`production`**
  environment (scoped there, not at repo level, so PRs cannot read it).
- **Revoke the exposed Kinde session** from the Kinde dashboard.
- Keep using `read -rs VAR` for anything secret. A token pasted into a transcript can
  arrive *corrupted* in a way that manufactures convincing false failures — during the
  backend deploy, a corrupted copy produced a `401` that looked exactly like an auth bug
  and sent the investigation after the wrong system entirely. The real cause was
  transcription damage, and `src/app/core/security.py` now logs why verification failed so
  that class of confusion is diagnosable.

## 12. Definition of done

- [ ] `next.config.ts` sets `output: "standalone"`
- [ ] Vercel-only `maxDuration` removed from both streaming routes
- [ ] `.dockerignore` present; `src/prisma/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` **not** ignored
- [ ] `Dockerfile` builds; container serves HTML **and** `/_next/static` assets
- [ ] Node version pinned (22 LTS)
- [ ] Neon: pooler enabled, auto-suspend `300`
- [ ] Railway frontend service created; **target port matches injected `PORT`**
- [ ] All 9 runtime env vars set as sealed values; `BACKEND_URL` points at the live backend
- [ ] Kinde production callbacks registered
- [ ] Backend un-paused; `/health` + `/openapi.json` + authenticated `/api/v1/chats` all `200`
- [ ] Full joint smoke (§10) passes end to end, including a multi-minute approved build
- [ ] Railway project token rotated; `RAILWAY_TOKEN` updated in GitHub `production` env
- [ ] Exposed Kinde session revoked
