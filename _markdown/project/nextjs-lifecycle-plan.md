# Next.js plan — chat rename/delete + account deletion (botchain-ai-next-app)

Companion plan for the backend repo is `backend-lifecycle-plan.md`. The backend
work ships first; this plan consumes its contract.

## Decision required before starting (user fills in)
`KINDE_DELETE_MODE = ____`  (`full` or `local-only`)
- `full`: account deletion also deletes the Kinde identity. Needs a Kinde M2M
  application (see 3a).
- `local-only`: erases all app data and the local user row, but the Kinde login
  remains. The next login recreates a fresh empty user via `/api/auth/sync`.

If this is blank, **stop and ask** before building step 3.

## Read first
`AGENTS.md`, `prisma-8.md` (Prisma 8 RC query API), and the Next.js docs bundled
in `node_modules/next` (prefer these to training data). Use the shadcn skill to
add UI components. If anything is ambiguous, stop and ask.

## Ownership rules
- **All writes to chats/messages go through the backend** via `fetchBackend` in
  `lib/backend.ts` (as `createChatAction` already does). Never write those tables
  through Prisma.
- Prisma is used for `users` (including the delete in step 3) and for the
  existing **read-only** chat list in `lib/user.ts`. Leave that read path alone;
  the list page already filters `deletedAt === null`.
- Identity always comes from the Kinde session, never from a parameter. Every
  server action is a publicly callable endpoint — authenticate inside it.

## Contract (from the backend plan)
| Call | Success | Errors to handle |
|---|---|---|
| `PATCH /api/v1/chats/{id}` `{title}` | `ChatOut` | 404, 422 |
| `DELETE /api/v1/chats/{id}` | 204 | 404 (treat as already gone), 409 active run |
| `DELETE /api/v1/me/data` | 204 | 401, 409 active run, 5xx |

`BackendError` exposes `.status` and `.detail`; show `.detail` for 409/422.

## Work, in this order

### 0. Hardening: `lib/user.ts` is marked `'use server'`
That turns its exports into Server Actions, and `getUser(kindeId)` takes an
arbitrary id and returns email, chats, and wallet. As far as I know Next.js only
exposes actions that client code references, so this is not exploitable today,
but one client import would make it a public endpoint with no auth check.
- Confirm against the bundled Next.js docs, and grep that no client component
  imports it.
- Replace `'use server'` with `import "server-only"`. This is a data helper, not
  an action.

### 1. Rename chat
- `renameChatAction(chatId, title)` in `chats/actions.ts`: authenticate from the
  session, trim, reject empty, cap at 120 characters (mirror the backend limit),
  call `PATCH`, then `revalidatePath('/users/<localUserId>/chats')`.
- UI: a "⋯" `DropdownMenu` on each chat `Card` on `chats/page.tsx` with Rename and
  Delete. Rename opens a `Dialog` with an `Input` (maxLength 120, submit disabled
  when empty or unchanged). Show 422 `detail` inside the dialog.
- The menu and dialogs are client components co-located under
  `src/app/users/[userId]/chats/`; the page stays a server component.

### 2. Delete chat
- `deleteChatAction(chatId)`: authenticate, `DELETE`, treat 404 as success,
  `revalidatePath` for the list. On 409, return the `detail` message; do not
  navigate.
- UI: `AlertDialog` confirm. Copy: "This chat will be removed from your chat
  list." Do not claim permanent erasure — chat delete is a soft delete.
- Optional, same components: expose Rename/Delete in the chat view header. After
  deleting from inside a chat, `redirect` to the chats list.

### 3. Account deletion

**3a. Kinde M2M (`full` mode only).** Create an M2M application in Kinde,
authorize it for the Management API with whatever scope the delete-user endpoint
requires, and add its credentials to `.env.local` and `_env-example.txt`. Install
`@kinde/management-api-js`. Read the package README/types for the exact env var
names and the delete-user method; do not guess them. `local-only` mode skips 3a
and the Kinde step in 3b.

**3b. `deleteAccountAction(confirmation)`** in a new `src/app/users/[userId]/actions.ts`.
Server-side, in this order:
1. Resolve the Kinde session, then the local user via `getUser`. No session or no
   local user → redirect to `/api/auth/logout`.
2. Re-verify the confirmation string against the user's email on the server.
3. `fetchBackend("/api/v1/me/data", { method: "DELETE" })`. On any failure
   (409, 5xx, backend down) **stop here** and return the error. The user row must
   still exist so they can retry.
4. Delete the `users` row through Prisma by `id`. Look up the delete syntax in
   `prisma-8.md` / the generated types — this is the Prisma 8 RC, so do not
   guess and do not fall back to raw SQL without asking the user.
5. `full` mode only: delete the Kinde user. If this fails, do **not** roll
   anything back; log the Kinde id server-side for manual cleanup and continue.
6. `redirect("/api/auth/logout")`. Never call `getUser`/sync again after step 4:
   `/api/auth/sync` would recreate the user.

Pitfall: `redirect()` throws. Do not wrap it in a `try/catch` that swallows the
redirect. Every step is safe to retry.

**3c. UI.** A "Danger zone" `Card` on the existing `/users/[userId]` page (no new
route). Client component `delete-account-dialog.tsx` next to it: `AlertDialog`
with a type-your-email `Input`, destructive button disabled until it matches,
pending state via `useTransition`/`useActionState`, no double submit, inline
error display.

Copy must match the mode:
- `full`: "This permanently deletes your chats and your login."
- `local-only`: "This deletes all your data. Signing in again creates a new empty
  account." Do not say the account can no longer be used.

### 4. Docs
Update `AGENTS.md`: chat writes only via backend, the account-deletion flow and
its order, the chosen `KINDE_DELETE_MODE`, and the `lib/user.ts` change.

## Verification
1. `pnpm lint` and `pnpm build` (type check) clean.
2. Rename: title updates in the list, `updated` timestamp changes, empty and
   121-character titles are rejected.
3. Delete chat: disappears from the list, its URL 404s, deleting while a run is
   streaming shows the 409 message.
4. Account deletion, **on a throwaway Kinde signup, not your real account**:
   create two chats and get one to the approval gate → delete the account →
   confirm you are logged out, the Neon tables (including the LangGraph ones)
   have nothing left for that user, and signing in again behaves as the chosen
   mode describes.
5. Failure paths: stop the backend and confirm the action errors while the user
   row still exists; delete during an active run and confirm the 409 message.

## Out of scope
Hard purge of soft-deleted chats, payment/ledger retention rules, and
free-credit abuse after re-signup.


# below content written after implementation of backend repo changes: 
# Next.js plan — chat rename/delete + account deletion (botchain-ai-next-app)

Companion plan for the backend repo is `backend-lifecycle-plan.md`. The backend
work ships first; this plan consumes its contract.

## Decision required before starting (user fills in)
`KINDE_DELETE_MODE = ____`  (`full` or `local-only`)
- `full`: account deletion also deletes the Kinde identity. Needs a Kinde M2M
  application (see 3a).
- `local-only`: erases all app data and the local user row, but the Kinde login
  remains. The next login recreates a fresh empty user via `/api/auth/sync`.

If this is blank, **stop and ask** before building step 3.

## Read first
`AGENTS.md`, `prisma-8.md` (Prisma 8 RC query API), and the Next.js docs bundled
in `node_modules/next` (prefer these to training data). Use the shadcn skill to
add UI components. If anything is ambiguous, stop and ask.

## Ownership rules
- **All writes to chats/messages go through the backend** via `fetchBackend` in
  `lib/backend.ts` (as `createChatAction` already does). Never write those tables
  through Prisma.
- Prisma is used for `users` (including the delete in step 3) and for the
  existing **read-only** chat list in `lib/user.ts`. Leave that read path alone;
  the list page already filters `deletedAt === null`.
- Identity always comes from the Kinde session, never from a parameter. Every
  server action is a publicly callable endpoint — authenticate inside it.

## Contract (from the backend plan)
| Call | Success | Errors to handle |
|---|---|---|
| `PATCH /api/v1/chats/{id}` `{title}` | `ChatOut` | 404, 422 |
| `DELETE /api/v1/chats/{id}` | 204 | 404 (treat as already gone), 409 active run |
| `DELETE /api/v1/me/data` | 204 | 401, 409 active run, 5xx |

`BackendError` exposes `.status` and `.detail`; show `.detail` for 409/422.

## Work, in this order

### 0. Hardening: `lib/user.ts` is marked `'use server'`
That turns its exports into Server Actions, and `getUser(kindeId)` takes an
arbitrary id and returns email, chats, and wallet. As far as I know Next.js only
exposes actions that client code references, so this is not exploitable today,
but one client import would make it a public endpoint with no auth check.
- Confirm against the bundled Next.js docs, and grep that no client component
  imports it.
- Replace `'use server'` with `import "server-only"`. This is a data helper, not
  an action.

### 1. Rename chat
- `renameChatAction(chatId, title)` in `chats/actions.ts`: authenticate from the
  session, trim, reject empty, cap at 120 characters (mirror the backend limit),
  call `PATCH`, then `revalidatePath('/users/<localUserId>/chats')`.
- UI: a "⋯" `DropdownMenu` on each chat `Card` on `chats/page.tsx` with Rename and
  Delete. Rename opens a `Dialog` with an `Input` (maxLength 120, submit disabled
  when empty or unchanged). Show 422 `detail` inside the dialog.
- The menu and dialogs are client components co-located under
  `src/app/users/[userId]/chats/`; the page stays a server component.

### 2. Delete chat
- `deleteChatAction(chatId)`: authenticate, `DELETE`, treat 404 as success,
  `revalidatePath` for the list. On 409, return the `detail` message; do not
  navigate.
- UI: `AlertDialog` confirm. Copy: "This chat will be removed from your chat
  list." Do not claim permanent erasure — chat delete is a soft delete.
- Optional, same components: expose Rename/Delete in the chat view header. After
  deleting from inside a chat, `redirect` to the chats list.

### 3. Account deletion

**3a. Kinde M2M (`full` mode only).** Create an M2M application in Kinde,
authorize it for the Management API with whatever scope the delete-user endpoint
requires, and add its credentials to `.env.local` and `_env-example.txt`. Install
`@kinde/management-api-js`. Read the package README/types for the exact env var
names and the delete-user method; do not guess them. `local-only` mode skips 3a
and the Kinde step in 3b.

**3b. `deleteAccountAction(confirmation)`** in a new `src/app/users/[userId]/actions.ts`.
Server-side, in this order:
1. Resolve the Kinde session, then the local user via `getUser`. No session or no
   local user → redirect to `/api/auth/logout`.
2. Re-verify the confirmation string against the user's email on the server.
3. `fetchBackend("/api/v1/me/data", { method: "DELETE" })`. On any failure
   (409, 5xx, backend down) **stop here** and return the error. The user row must
   still exist so they can retry.
4. Delete the `users` row through Prisma by `id`. Look up the delete syntax in
   `prisma-8.md` / the generated types — this is the Prisma 8 RC, so do not
   guess and do not fall back to raw SQL without asking the user.
5. `full` mode only: delete the Kinde user. If this fails, do **not** roll
   anything back; log the Kinde id server-side for manual cleanup and continue.
6. `redirect("/api/auth/logout")`. Never call `getUser`/sync again after step 4:
   `/api/auth/sync` would recreate the user.

Pitfall: `redirect()` throws. Do not wrap it in a `try/catch` that swallows the
redirect. Every step is safe to retry.

**3c. UI.** A "Danger zone" `Card` on the existing `/users/[userId]` page (no new
route). Client component `delete-account-dialog.tsx` next to it: `AlertDialog`
with a type-your-email `Input`, destructive button disabled until it matches,
pending state via `useTransition`/`useActionState`, no double submit, inline
error display.

Copy must match the mode:
- `full`: "This permanently deletes your chats and your login."
- `local-only`: "This deletes all your data. Signing in again creates a new empty
  account." Do not say the account can no longer be used.

### 4. Docs
Update `AGENTS.md`: chat writes only via backend, the account-deletion flow and
its order, the chosen `KINDE_DELETE_MODE`, and the `lib/user.ts` change.

## Verification
1. `pnpm lint` and `pnpm build` (type check) clean.
2. Rename: title updates in the list, `updated` timestamp changes, empty and
   121-character titles are rejected.
3. Delete chat: disappears from the list, its URL 404s, deleting while a run is
   streaming shows the 409 message.
4. Account deletion, **on a throwaway Kinde signup, not your real account**:
   create two chats and get one to the approval gate → delete the account →
   confirm you are logged out, the Neon tables (including the LangGraph ones)
   have nothing left for that user, and signing in again behaves as the chosen
   mode describes.
5. Failure paths: stop the backend and confirm the action errors while the user
   row still exists; delete during an active run and confirm the 409 message.

## Out of scope
Hard purge of soft-deleted chats, payment/ledger retention rules, and
free-credit abuse after re-signup.
