import { notFound } from "next/navigation";
import { BackendError, fetchBackend } from "@/lib/backend";
import {
  toUIMessage,
  type ChatOut,
  type MessageOut,
  type Paginated,
} from "@/lib/chat-types";
import { ChatView } from "./chat-view";

/** How many messages to seed the thread with on first paint. */
const HISTORY_PAGE_SIZE = 100;

export default async function UserChatPage({
  params,
}: {
  params: Promise<{ userId: string; chatId: string }>;
}) {
  const { userId, chatId } = await params;

  // The backend resolves the Kinde `sub` to a local user and 404s on a chat
  // that isn't theirs, so a 404 here is the ownership check for the page.
  let history: Paginated<MessageOut>;
  let chat: ChatOut;
  try {
    [history, chat] = await Promise.all([
      fetchBackend<Paginated<MessageOut>>(
        `/api/v1/chats/${encodeURIComponent(chatId)}/messages?page_size=${HISTORY_PAGE_SIZE}`,
      ),
      // Only for the header's rename/delete menu and its accessible label.
      fetchBackend<ChatOut>(`/api/v1/chats/${encodeURIComponent(chatId)}`),
    ]);
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <ChatView
      userId={userId}
      chatId={chatId}
      chatTitle={chat.title}
      initialMessages={history.items.map(toUIMessage)}
    />
  );
}
