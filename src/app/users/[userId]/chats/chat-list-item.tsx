import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { ChatCardMenu } from "./chat-card-menu";
import { formatDate, toDate, type TimestampLike } from "@/lib/dates";

/**
 * One row of a chat list. Shared by the dashboard list and the collapsed
 * overflow so the two renderings cannot drift apart.
 *
 * Renders the `Card` only — the caller owns the `<li>`, because the overflow
 * rows sit inside a nested list.
 */
export function ChatListItem({
  userId,
  chat,
}: {
  userId: string;
  chat: {
    id: string;
    title: string;
    model: string | null;
    updatedAt: TimestampLike;
  };
}) {
  return (
    <Card
      size="sm"
      className="group gap-0 py-0 transition-colors hover:bg-accent/40"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-1 px-2">
        <Link
          href={`/users/${userId}/chats/${chat.id}`}
          className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <span className="block truncate text-[14px] font-medium leading-tight">
            {chat.title}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-4 text-[13px] text-muted-foreground">
          <span
            className="hidden sm:inline max-w-36 truncate"
            title={chat.model ?? undefined}
          >
            {chat.model}
          </span>
          <span
            className="tabular-nums"
            title={toDate(chat.updatedAt)?.toLocaleString() ?? ""}
          >
            Updated {formatDate(chat.updatedAt)}
          </span>
        </div>

        <ChatCardMenu chatId={chat.id} title={chat.title} />
      </CardHeader>
    </Card>
  );
}
