"use server";

import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BackendError, fetchBackend } from "@/lib/backend";
import { CHAT_TITLE_MAX_LENGTH } from "@/lib/chat-limits";
import type { ChatOut } from "@/lib/chat-types";
import { getUser } from "@/lib/user";

/**
 * Every Server Function is a publicly callable endpoint, so these authenticate
 * from the Kinde session and never trust a browser-supplied identity. Ownership
 * itself is the backend's job — `get_owned_chat` answers 404 for a chat that is
 * missing, soft-deleted, or someone else's, so there is nothing to check here.
 *
 * Only async functions may be exported here; shared constants live in
 * `@/lib/chat-limits`.
 */
export type ChatActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Human-readable text for anything `fetchBackend` can throw. */
function describeFailure(error: unknown): string {
  if (error instanceof BackendError) return error.detail;
  return "Could not reach the server. Check your connection and try again.";
}

/**
 * Creates a chat on the FastAPI backend and navigates into it.
 *
 * The chat row is created by the backend (not Prisma) so that ownership, the
 * default title, and the model all come from one place. `ChatCreate` fields are
 * optional, so an empty body takes the backend defaults.
 *
 * Runs as a server action rather than through a proxy route: no client JS, no
 * extra network hop, and the local user id is resolved from the Kinde session
 * instead of trusting a value passed in by the browser.
 */
export async function createChatAction(): Promise<void> {
  const { getUser: getKindeUser } = getKindeServerSession();
  const kindeUser = await getKindeUser();

  if (!kindeUser) {
    redirect("/api/auth/logout");
  }

  const localUser = await getUser(kindeUser.id);
  if (!localUser) {
    throw new Error(
      "No local user row for this Kinde account yet. Visit the dashboard once to sync it.",
    );
  }

  const chat = await fetchBackend<ChatOut>("/api/v1/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  redirect(`/users/${localUser.id}/chats/${chat.id}`);
}

/**
 * Rename a chat, then refresh the list.
 *
 * Validates the title locally so an obviously-bad value never costs a round
 * trip, but the backend's 422 `detail` is still what the user sees if it
 * disagrees — the rules here are a mirror, not the authority.
 */
export async function renameChatAction(
  chatId: string,
  title: string,
): Promise<ChatActionResult> {
  const { getUser: getKindeUser } = getKindeServerSession();
  const kindeUser = await getKindeUser();
  if (!kindeUser) return { ok: false, error: "Your session expired. Sign in again." };

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Title cannot be empty." };
  if (trimmed.length > CHAT_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Title must be ${CHAT_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const localUser = await getUser(kindeUser.id);
  if (!localUser) {
    return {
      ok: false,
      error: "No local user row for this account yet. Visit the dashboard once to sync it.",
    };
  }

  try {
    await fetchBackend<ChatOut>(`/api/v1/chats/${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  } catch (error) {
    return { ok: false, error: describeFailure(error) };
  }

  revalidatePath(`/users/${localUser.id}/chats`);
  return { ok: true };
}

/**
 * Soft-delete a chat, then refresh the list. The row stays in the database and
 * only disappears from reads, so this is reversible in principle.
 *
 * A 404 counts as success: the chat is already gone, which is the state the
 * caller asked for. A 409 means a run is streaming and its `detail` is shown
 * verbatim so the user knows to wait rather than that something broke.
 */
export async function deleteChatAction(
  chatId: string,
): Promise<ChatActionResult> {
  const { getUser: getKindeUser } = getKindeServerSession();
  const kindeUser = await getKindeUser();
  if (!kindeUser) return { ok: false, error: "Your session expired. Sign in again." };

  const localUser = await getUser(kindeUser.id);
  if (!localUser) {
    return {
      ok: false,
      error: "No local user row for this account yet. Visit the dashboard once to sync it.",
    };
  }

  try {
    await fetchBackend<void>(
      `/api/v1/chats/${encodeURIComponent(chatId)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) {
      revalidatePath(`/users/${localUser.id}/chats`);
      return { ok: true };
    }
    return { ok: false, error: describeFailure(error) };
  }

  revalidatePath(`/users/${localUser.id}/chats`);
  return { ok: true };
}
