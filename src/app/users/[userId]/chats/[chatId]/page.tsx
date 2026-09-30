import { notFound } from "next/navigation";
import { BackendError, fetchBackend } from "@/lib/backend";
import {
  toUIMessage,
  type ChatOut,
  type MessageOut,
  type Paginated,
} from "@/lib/chat-types";
import { ChatView } from "./chat-view";
import { ChatCardMenu } from "../chat-card-menu";
import { SiteNav } from "@/components/site-nav";

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
    // This wrapper owns the viewport height for the pair: the nav is
    // `shrink-0`, and `ChatView`'s section takes the remainder via `flex-1
    // min-h-0`. Without it the two would stack to `nav + 100dvh` and the page
    // would scroll by exactly the nav's height.
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Rendered here rather than inside `ChatView` because that component is a
          client component: an async server component can't be rendered from
          one. It also keeps the chrome out of the streaming re-renders. */}
      <SiteNav
        dashboardHref={`/users/${userId}`}
        actions={
          <ChatCardMenu
            chatId={chatId}
            title={chat.title}
            redirectTo={`/users/${userId}/chats`}
          />
        }
        className="z-20 w-full shrink-0 border-x border-t border-b border-border bg-background/90 backdrop-blur-sm"
      >
        <span
          className="truncate text-sm font-medium text-foreground"
          title={chat.title}
        >
          {chat.title}
        </span>
      </SiteNav>
      <ChatView
        chatId={chatId}
        initialMessages={history.items.map(toUIMessage)}
      />
    </div>
  );
}
