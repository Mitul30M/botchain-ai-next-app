import { Skeleton } from "@/components/ui/skeleton";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { createChatAction } from "./actions";
import { ChatCardMenu } from "./chat-card-menu";
import { formatDate, toDate } from "@/lib/dates";
import { getUser } from "@/lib/user";
import { SiteNav } from "@/components/site-nav";

export default async function ChatsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { getUser: getKindeUser } = getKindeServerSession();
  const kindeUser = await getKindeUser();

  // `getUser` is keyed on the Kinde `sub`, not the local UUID in the URL.
  const localUser = kindeUser ? await getUser(kindeUser.id) : null;
  const chats = (localUser?.chats ?? []).filter(
    (chat) => chat.deletedAt === null,
  );

  return (
    <section className="flex w-full max-w-6xl self-center border-x border-border flex-1 items-center flex-col">
      <SiteNav dashboardHref={`/users/${userId}`} />
      <main className="mx-auto flex w-full flex-1 flex-col gap-6 py-6">
        <h1 className="text-xl my-0 px-4 sm:px-6 font-semibold leading-10 tracking-tight text-foreground">
          {kindeUser ? (
            `${kindeUser.given_name}'s Chats`
          ) : (
            <Skeleton className="h-6 w-32" />
          )}
        </h1>
        {chats.length === 0 ? (
          <div className="text-sm my-0 px-4 text-center sm:px-6 text-muted-foreground">
            <form action={createChatAction}>
              <Button type="submit" className="my-2">
                New Chat
              </Button>
            </form>
            No chats yet. Create one to start planning an automation.
          </div>
        ) : (
          <ul className="flex w-180 self-center flex-col my-0 px-4 sm:px-6 gap-2">
            <form action={createChatAction} className="self-end">
              <Button type="submit" className="my-2">
                New Chat
              </Button>
            </form>
            {chats.map((chat) => (
              <li key={chat.id}>
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
              </li>
            ))}
          </ul>
        )}
      </main>
    </section>
  );
}
