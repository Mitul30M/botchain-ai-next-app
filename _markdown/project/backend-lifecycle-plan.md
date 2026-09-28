# Backend plan — chat lifecycle + account data purge (botchain-ai)

Companion plan for the Next.js repo is `nextjs-lifecycle-plan.md`. The two repos
must agree on the **contract** below — do not change it without telling the user.

## Read first
1. `AGENTS.md` — settled decisions, folder structure, non-negotiable DB rules.
2. `_markdown/backend-api-schema.md` — the API contract the frontend consumes.
3. `_nextjs_repo_context/prisma/contract.prisma` — live schema. **No schema change
   is needed for this work.**

If anything here is ambiguous or seems to need a divergence from AGENTS.md,
**stop and ask** instead of deciding silently.

## Ownership rules (do not violate)
- Backend is the **only writer** of `chats`, `messages`, `attachments`,
  `credit_*`, `payment_topups`, and the LangGraph checkpoint tables.
- `users` stays Prisma/Next.js-owned. The backend never inserts, updates, or
  deletes a `users` row, and never migrates it.
- No Alembic migration, and **no `ON DELETE CASCADE`**. Deletion is explicit,
  ordered, and written in code.

## Contract to deliver (frontend depends on this exactly)
| Endpoint | Success | Errors |
|---|---|---|
| `PATCH /api/v1/chats/{id}` body `{title}` | 200 `ChatOut` | 404 not owned/missing/deleted, 422 invalid title |
| `DELETE /api/v1/chats/{id}` | 204 (soft delete, unchanged) | 404 not owned/missing/already deleted, **409 if a run is active on the chat (new)** |
| `DELETE /api/v1/me/data` (new) | 204, idempotent | 401 no user row, **409 if any of the user's chats has an active run**, 5xx on failure (safe to retry) |

`409` bodies use FastAPI's `{"detail": "<human-readable sentence>"}` like the
existing 409s. The frontend shows `detail` to the user verbatim.

## Work, in this order

### 0. Chat lock registry — inspect before touching anything
The per-chat `asyncio.Lock` registry lives in the messages route today. Chat
delete and the purge both need to ask "is a run active on this chat?".
- Reuse the existing registry. **Do not create a second one** — two registries
  would defeat the purpose.
- If it is private to `api/v1/messages.py`, propose the smallest extraction
  (e.g. a small module under `services/`) and flag it in your summary as a
  small structure addition.
- Remember the earlier double-release bug: every lock you acquire is released
  **exactly once**, in a `finally`.

### 1. Chat rename — verify, then tighten
`PATCH /chats/{id}` already exists (title only). Check and fix if needed:
- `ChatUpdate.title` rejects empty/whitespace-only, strips whitespace, and has a
  max length (default **120** unless the user says otherwise). A body with no
  `title` must have a defined behavior (422 or no-op — pick 422 and document it).
- Does the handler set `updated_at = now()`? Message writes deliberately do not
  bump it, but a rename is a real edit of the chat — it **should** bump it. If it
  doesn't, add it (the chat list shows "updated").

### 2. Chat delete — add the active-run guard
Soft delete (`deleted_at`) stays. Add: if the chat's lock is currently held →
409 `"A response is still being generated for this chat — try again in a moment."`
- A chat **waiting on approval** is *not* an active run (no lock held) and must
  remain deletable.
- Second DELETE on an already-deleted chat returns 404 via `get_owned_chat` —
  fine, document it; the frontend treats 404 as "already gone".
- Do not purge checkpoints on soft delete. That is a later hard-purge job.

### 3. Account data purge — `DELETE /api/v1/me/data`
New files (small additions to the agreed structure — mention them in your
summary): `api/v1/me.py` (route, mounted in `api/router.py`) and
`services/account.py` (framework-agnostic logic; design it so a later per-chat
hard purge can reuse it).

Behavior, in exactly this order:
1. Authenticate with `Depends(get_current_user)`. The purge never deletes the
   `users` row — the frontend does that afterwards, and it needs this user row to
   still exist for the call to authenticate.
2. Select **all** the user's chat ids, **including soft-deleted ones**.
3. Acquire (get-or-create) every chat's lock without waiting. If any is held,
   release the ones you took and return 409. Hold all locks until the purge is
   done; release each once in `finally`. After a successful purge, drop the
   purged chats' registry entries if the helper makes that simple.
4. **Delete checkpoints first:** `await checkpointer.adelete_thread(chat_id)` for
   each chat id (`app.state.checkpointer`; method verified on
   `AsyncPostgresSaver`). Confirm the thread id used by the agent config really
   is `chat.id`. Reason for the order: checkpoints commit separately from SQL, and
   the chat rows are the durable list of thread ids to purge. If SQL ran first and
   checkpoint deletion then failed, conversation content would be orphaned with
   nothing left to find it by.
5. **One SQL transaction**, keyed by `user_id` (not by the id list, so a chat
   created mid-purge is still caught), FK-safe order:
   attachments → messages → chats → credit_transactions → payment_topups →
   credit_wallets. One `DELETE` per table is fine even with the self-referential
   `messages.parent_id` (NO ACTION is checked at end of statement).
6. Commit, return 204. Zero rows anywhere is still 204 (idempotent).

Failure handling: any exception → 5xx, nothing swallowed, log the chat id being
processed. A retry re-derives everything from the database, so it is safe.

Check what `Attachment.file_url` points to and what the download route reads.
If any attachment content lives outside Postgres, the purge must delete that
too. If it is all in the database, say so in your summary.

### 4. Tests (same style as `test_route_session_release.py`: TestClient,
dependency overrides, fakes)
- purge order: checkpoint deletes recorded **before** any SQL delete
- purge includes soft-deleted chats' checkpoints
- purge issues no statement against `users`
- 409 when any chat lock is held: nothing deleted, all acquired locks released once
- idempotent: second purge on empty data → 204
- 401 without a user row
- chat delete: 409 with lock held, 204 when only approval is pending, 404 second time
- rename: empty/whitespace/overlong → 422, `updated_at` bumped

### 5. Docs
Update `AGENTS.md` (settled decisions: backend purges, Next.js deletes the users
row and the Kinde identity; add the endpoint to the API surface) and
`_markdown/backend-api-schema.md` (the three contract rows above).

## Verification gate
1. `uv run ruff check src tests` clean.
2. Existing suite still green plus the new tests.
3. App boots; `/openapi.json` lists `DELETE /api/v1/me/data`.
4. Manual smoke against the **`tests` Neon branch or a throwaway user** — see below.

## Safety: never smoke-test the purge on the real account
The production database holds the user's real row and chats. Run the manual
smoke only with a throwaway user (create a fresh Kinde signup) or on the `tests`
branch. After purging, confirm with SQL that no rows remain for that user in any
backend-owned table and that the four LangGraph tables (`checkpoints`,
`checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) hold nothing for
that user's chat ids.

## Out of scope / revisit later
- Hard-purge job for soft-deleted chats (reuse `services/account.py`).
- Retention rules for `payment_topups`/ledger rows: deleting them is fine while
  billing is unwired; revisit before payments go live.
- Free-credit re-signup after deletion: a billing concern for later.
