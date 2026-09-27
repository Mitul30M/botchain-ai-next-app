"use server";

import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";
import { fetchBackend } from "@/lib/backend";
import type { ChatOut } from "@/lib/chat-types";
import { getUser } from "@/lib/user";

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
