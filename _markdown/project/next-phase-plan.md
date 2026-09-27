# Phase 6 — Next.js app: proxy the FastAPI Data Stream Protocol into `useChat`

**Read me first:** this repo is **read-only for the planning session** — nothing
here is implemented. This is the change plan the nextjs repo owner executes once
the backend Phase 6 (see `botchain-ai/_markdown/phase6/backend-phase6-plan.md`,
same decision record) lands. If anything here conflicts with the backend plan,
the backend plan is the source of truth for the wire format.

## 1. Where we are

- `src/app/api/chat/route.ts` returns a **dummy** hand-written SSE response
  (`data: {...}` lines, `x-vercel-ai-ui-message-stream: v1`,
  `export const maxDuration = 30`). It never calls a backend.
- The chat page (`src/app/users/[userId]/chats/[chatId]/page.tsx`) calls
  `useChat()` from `@ai-sdk/react` **with no options** → default
  `HttpChatTransport` → POST `/api/chat` with `{ messages }`, consuming the
  **Data Stream Protocol**.
- Verified against the installed AI SDK v7/`@ai-sdk/react` v4 types (not
  training memory): default transport = DSP; `useChat` accepts `body`, `headers`,
  `onData` (receives `data-*` parts), `onFinish`, `onError`. So **the frontend
  needs no protocol/transport changes** — only the proxy and page wiring.

## 2. Backend contract to code against

- Streaming endpoint: `POST {BACKEND_URL}/api/v1/chats/{chatId}/messages`
  (and `/api/v1/chats/{chatId}/approve`) with `Authorization: Bearer <Kinde
  JWT>`; response is SSE with `content-type: text/event-stream` +
  `x-vercel-ai-ui-message-stream: v1` + `x-accel-buffering: no`.
- Chunks: `{"type":"start"}`, `{"type":"data-status","data":{"status":"…"},
  "transient":true}` (progress heartbeats, live-only), `text-start` /
  `text-delta` / `text-end` (the reply text, **fresh uuid part id per text
  segment** — never reuse, see backend plan §2), `{"type":"finish",
  "finishReason":"stop"}`, then `data: [DONE]`.
- Pre-stream HTTP errors are JSON `{"detail": "…"}` (409 = chat awaiting
  approval, 404 chat, 401 auth). In-stream errors: `{"type":"error",
  "errorText":"…"}`.
- Authoritative message history + attachment metadata: `GET
  /api/v1/chats/{chatId}/messages` (paginated `MessageOut`, incl. `meta` and
  `attachments`). Workflow file download: `GET
  /api/v1/chats/{chatId}/messages/{messageId}/attachments/{attachmentId}/download`.
- Confirm gate signalled via `meta.phase === "confirm"` +
  `meta.approval.status === "pending"` on the last assistant message (stream
  itself ends normally — no in-stream signal).

## 3. Changes — `src/app/api/chat/route.ts` (rewrite the dummy)

1. **Auth (server-side only):** `getKindeServerSession()` from
   `@kinde-oss/kinde-auth-nextjs/server`. Use `getAccessTokenRaw()` for the
   bearer token — Q7 settled decision (reliable raw signed JWT across
   `@kinde-oss` versions; `getAccessToken()` is inconsistent). If
   `!isAuthenticated()` or no token → `NextResponse.json({ error: { message:
   "Unauthorized" } }, { status: 401 })`.
2. **Request body:** `body` includes `{ messages, chatId }` (page sends
   `useChat({ body: { chatId } })`). Take the last user message's text from
   `messages` (mirror the current placeholder text-extraction shape); pass
   `{ content }` to the backend. If the last assistant message id is available,
   pass it as `parent_id` (lineage only, optional).
3. **Call the backend:** `fetch(\`${process.env.BACKEND_URL}/api/v1/chats/${chatId}/messages\`,
   { method: "POST", headers: { "authorization": \`Bearer ${token}\`,
   "content-type": "application/json" }, body: JSON.stringify({ content }) })`.
4. **Pass through, don't buffer:** `return new Response(res.body, { status:
   res.status, headers: res.headers })`. Never `.json()`/`.text()` the body.
   Next.js route handlers stream `res.body` by default. Preserve backend headers
   wholesale (esp. `x-vercel-ai-ui-message-stream: v1` + content-type).
5. **Error mapping:** `res.status !== 200` (4xx) → return JSON `{ error: {
   message: <backend detail> } }` with same status so `useChat`'s `error`
   surfaces it cleanly.
6. **Set `maxDuration` explicitly — do not delete it.** Removing the export does
   **not** mean "unlimited": the function reverts to the plan default, and every
   plan still enforces a **hard ceiling** that kills the invocation outright with
   `504 FUNCTION_INVOCATION_TIMEOUT`. It counts the *total* request + streamed-response
   time — a distinct mechanism from any idle timeout the status heartbeats handle.
   Phase 5 live runs show **~135 s+ worst case** (one run streamed ~97k input tokens
   across build + repair passes). Concretely:
   - Put `export const maxDuration = 300;` in each proxy route (300 s covers ~135 s
     builds with headroom and is the floor to target).
   - Ceilings as of 2026-09 (verify against
     https://vercel.com/docs/functions/limitations — they've changed before):
     with **Fluid Compute** (default on new projects) the default is 300 s on all
     plans; max per plan is Hobby 300 s (not configurable above), Pro/Enterprise
     800 s, extended 1800 s (beta, per-function). On a **non-Fluid** deployment
     (project predates 2025-04-23, or Fluid disabled) the ceilings are far lower —
     Hobby default 10 s / max 60 s, Pro default 15 s / max 300 s — and there a
     135 s build is **impossible on Hobby at any setting**.
   - Check which compute mode the project actually runs before relying on any of
     these; the safe statement is "300 s floor, plan ceiling verified ≥ worst-case
     build time", not "no cap".

## 4. New proxy routes (small, all token-forwarded)

- `src/app/api/chats/[chatId]/approve/route.ts` — `POST {approved, feedback}`
  → backend `/approve`, pipe the SSE body straight back (same pass-through as
  `/api/chat`). Keeps runtime separation from chat content.
- `src/app/api/chats/[chatId]/messages/route.ts` — `GET` → backend messages
  list; return JSON as-is (typed `Paginated<MessageOut>`).
- `src/app/api/chats/[chatId]/messages/[messageId]/attachments/[attachmentId]/download/route.ts`
  — `GET` → backend download; pipe file bytes + `Content-Disposition` through
  (the backend URL + token must not reach the browser).

Shared: a tiny `lib/backend.ts` helper (`getAccessTokenRaw` + `fetchBackend(path,
init)`) so the 4 routes don't each repeat the Kinde/fetch plumbing.

## 5. Changes — chat page `page.tsx`

1. `useChat({ body: { chatId }, onData, onFinish })`. userId isn't needed by the
   API (backend derives the owner from the JWT; the route segment just guards
   page access).
2. **Live status banner:** in `onData`, when `data.type === "data-status"` store
   `data.data.status` in local state; render it as the "thinking" line instead of
   the static `loadingState` while `status === "streaming"`. (Transient parts
   don't persist into `message.parts` — that's intended.)
3. **Reconcile on finish:** in `onFinish`, fetch history via the messages proxy
   and `setMessages(...)` so the optimistic UI is replaced by persisted rows —
   this is what surfaces the confirm gate (`meta.phase === "confirm"`,
   `approval.status === "pending"`) and the done-state attachment.
4. **Approval gate UI:** when the latest assistant message is pending approval,
   render Approve / Reject (optional feedback mini-input). On click: POST the
   approve proxy with the streamed body; while that continuation streams, show
   the live `data-status` banner (parse SSE events from `res.body` reader — a
   small `readSseStream` helper in `lib/`); on completion re-fetch history again.
   (Native streaming of the approve continuation *through* `useChat` is listed as
   a follow-up; a plain streaming fetch + history refresh gets Phase 6 across
   the finish line with minimal risk.)
5. **Attachment render:** assistant message with `meta.phase === "done"` + an
   `attachments[0]` → download link hitting the download proxy.
6. Keep the existing empty state, copy button, and stop-on-submit (the submit
   button already calls `stop()` while streaming — that still aborts the DSP
   stream correctly).

## 6. Not in scope

- Running the backend, n8n-mcp, or Ollama from this repo (deferred; local
  verification uses the dev backend on `BACKEND_URL`).
- Chat list / create / rename / soft-delete wiring (frontend Phase 3 remaining
  items).
- Multi-chat history management beyond the current page.
- Reasoner/tool DSP parts, `dataPartSchemas`, `resumeStream` reconnects.

## 7. Verification (executed in this repo by its owner)

1. `pnpm dev`; `/api/chat` fires the proxy: verify response headers
   (`text/event-stream`, `x-vercel-ai-ui-message-stream: v1`), token
   incremental render, `data-status` banner appears during Planning/Build.
2. Kill the backend mid-build → `useChat` `error` path + persisted error row on
   refresh.
3. 409 path: send a message while a chat is pending approval → error surfaces,
   prompt disabled, Approve/Reject shown.
4. Approve → continuation streams → history refresh shows the final
   `meta.phase === "done"` message + attachment; download works.
5. Two users / two chats concurrently — streams stay isolated (backend per-chat
   lock).
6. **Multi-status build run on the wire** (guards the fresh-text-part-id fix):
   run a prompt whose build/validate pass emits several statuses between text
   (or a graph that reopens text — e.g. an approve with a rejected-feedback
   replan, then approval text). Capture the raw SSE and confirm: every `text-start`
   carries a **distinct id**, and never a `text-delta` for segment N arriving after
   `text-end` of segment N with a reused id; statuses only in `data-status` parts.

## 8. Backend↔frontend coordination notes (for the wiring session)

- `BACKEND_URL` env on this repo points at the dev/Railway backend; the proxy
  keeps the browser origin-clean (CORS stays a non-issue).
- Keep the body `{ messages, chatId }` contract in sync with `/api/chat`; if
  `sendMessage` ever grows options, thread them through `body` explicitly rather
  than overloading `messages`.
- Coordinate the docs rewrite (backend `_nextjs_repo_context/backend-api-schema.md`
  §5) with this page's expectations before first e2e — both describe the same
  wire format.