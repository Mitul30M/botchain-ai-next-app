/**
 * Account-deletion configuration and the user-facing copy that depends on it.
 *
 * Shared constants live outside `actions.ts` on purpose: every export from a
 * `"use server"` file becomes a Server Function endpoint, and Next.js rejects
 * anything that is not an async function there.
 *
 * Keeping the mode and its copy together is the point — the dialog must never
 * describe something the action does not do.
 */
export const KIND_E_DELETE_MODE = "local-only" as const;

/**
 * What the confirmation dialog tells the user is about to happen.
 *
 * `local-only` deliberately does *not* claim the account can no longer be used:
 * the Kinde identity survives, so signing in again creates a new empty account.
 */
export const DELETE_ACCOUNT_COPY: Record<
  typeof KIND_E_DELETE_MODE,
  { dialogDescription: string; buttonLabel: string }
> = {
  "local-only": {
    dialogDescription:
      "This deletes all your data. Signing in again creates a new empty account.",
    buttonLabel: "Permanently delete my account",
  },
};
