"use server";

import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";
import { KIND_E_DELETE_MODE } from "@/lib/account-lifecycle";
import { BackendError, fetchBackend } from "@/lib/backend";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/user";

/**
 * `KIND_E_DELETE_MODE` decides how much of the account goes away. See
 * `@/lib/account-lifecycle` — it is imported, not re-declared, so this file
 * exports only async functions.
 */
export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Permanently delete the signed-in user's data, then log them out.
 *
 * Ordered so that any failure is retryable and never strands a half-deleted
 * account:
 *
 *   1. the backend purge runs first, while the local row still exists, so a
 *      409/5xx leaves a user who can simply try again;
 *   2. the local row goes second and is the only irreversible local step;
 *   3. logout comes last, because the layout and `/api/auth/sync` both key off
 *      that row and would otherwise rebuild what we just deleted.
 *
 * `redirect()` throws, so it is never wrapped in a `try`/`catch` — a swallowed
 * redirect would look like a silent success.
 */
export async function deleteAccountAction(
  confirmation: string,
): Promise<DeleteAccountResult> {
  const { getUser: getKindeUser } = getKindeServerSession();
  const kindeUser = await getKindeUser();
  if (!kindeUser) {
    redirect("/api/auth/logout");
  }

  // The client disables its button until the text matches, but that is a
  // convenience: this check is what actually gates the purge.
  const localUser = await getUser(kindeUser.id);
  if (!localUser) {
    redirect("/api/auth/logout");
  }

  if (confirmation.trim() !== localUser.email) {
    return {
      ok: false,
      error: "Confirmation did not match your email address.",
    };
  }

  try {
    await fetchBackend<void>("/api/v1/me/data", { method: "DELETE" });
  } catch (error) {
    // Stop here on purpose. The local row survives, so the user can retry once
    // the backend is healthy.
    return {
      ok: false,
      error:
        error instanceof BackendError
          ? error.detail
          : "Could not reach the server. Nothing was deleted — please try again.",
    };
  }

  // Prisma 8: a mutation requires a filter, and `delete()` resolves to the
  // removed row or null. Keyed on the row's own id, not the `sub` we were
  // handed, so a mismatch cannot delete the wrong account.
  const deleted = await prisma.orm.public.User
    .where((u) => u.id.eq(localUser.id))
    .delete();

  if (!deleted) {
    // The backend is already purged, so this is not retryable in a useful way;
    // say what actually happened rather than implying nothing was removed.
    return {
      ok: false,
      error:
        "Your data was deleted, but the local account record could not be removed. Please contact support.",
    };
  }

  // `local-only` mode: the Kinde account is intentionally left in place, so
  // signing in again creates a new empty account. The id is logged so the
  // retained identity can be traced (or cleaned up later) without a database
  // row to join on.
  if (KIND_E_DELETE_MODE === "local-only") {
    console.info(
      `[account-deletion] local data purged, Kinde identity retained: kinde_id=${kindeUser.id}`,
    );
  }

  redirect("/api/auth/logout");
}
