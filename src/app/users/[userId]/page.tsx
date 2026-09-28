import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { getUser } from "@/lib/user";
import { toDate } from "@/lib/dates";
import { ChatListItem } from "./chats/chat-list-item";
import { MoreChats } from "./chats/more-chats";
import { createChatAction } from "./chats/actions";
import { Separator } from "@/components/ui/separator";

/** Chats shown before the rest collapse behind a "Show N more" toggle. */
const VISIBLE_CHAT_COUNT = 8;

export default async function UserDashboardPage({
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

  // The rows display an "Updated" date, so rank by `updatedAt` rather than the
  // `createdAt` order the query returns — otherwise a chat edited today can sit
  // below one untouched for a month.
  const rankedChats = [...chats].sort(
    (a, b) => (toDate(b.updatedAt)?.getTime() ?? 0) - (toDate(a.updatedAt)?.getTime() ?? 0),
  );
  const visibleChats = rankedChats.slice(0, VISIBLE_CHAT_COUNT);
  const overflowChats = rankedChats.slice(VISIBLE_CHAT_COUNT);

  return (
    <section className="flex w-full max-w-6xl self-center border-x border-border flex-1 items-center flex-col">
      <header className="sticky top-0 z-20 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full flex-col px-4 py-2.5 sm:px-6">
          <p className="text-xs text-muted-foreground">route: /users/{userId}</p>
          <div className="flex items-center justify-between gap-3">
            <Link className="text-sm text-primary hover:underline" href={`/`}>
              Back to the Home Page
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full flex-1 flex-col gap-6 py-6">
        <div className="flex w-full flex-col gap-2 px-4 sm:px-6">
          <h1 className="text-2xl font-semibold leading-10 tracking-tight text-foreground">
            {kindeUser ? (
              `Welcome, ${kindeUser.given_name}`
            ) : (
              <Skeleton className="h-6 w-32" />
            )}
          </h1>
          <p className="">
            {kindeUser ? (
              `Email: ${kindeUser.email}`
            ) : (
              <Skeleton className="h-4 w-48" />
            )}
          </p>
          <p className="">
            {kindeUser ? (
              `Kinde UserID: ${kindeUser.id}`
            ) : (
              <Skeleton className="h-4 w-48" />
            )}
          </p>
          <p className="">
            {kindeUser ? (
              `UserID: ${userId}`
            ) : (
              <Skeleton className="h-4 w-48" />
            )}
          </p>
          {/* <Link href={`/users/${userId}/chats`}>
          <Button className="w-full">View Chats</Button>
        </Link> */}
        </div>

        <Separator className="border-accent-foreground" />

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
            {visibleChats.map((chat) => (
              <li key={chat.id}>
                <ChatListItem userId={userId} chat={chat} />
              </li>
            ))}
            {overflowChats.length > 0 && (
              <li>
                <MoreChats count={overflowChats.length}>
                  <ul className="flex flex-col gap-2">
                    {overflowChats.map((chat) => (
                      <li key={chat.id}>
                        <ChatListItem userId={userId} chat={chat} />
                      </li>
                    ))}
                  </ul>
                </MoreChats>
              </li>
            )}
          </ul>
        )}

        <Separator className="border-accent-foreground mb-0 mt-6" />
        {kindeUser?.email && (
          <Card className=" max-w-100  mt-0 w-full mx-4! sm:mx-4! border-border bg-muted/40">
            <CardHeader className="grid gap-1.5">
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-muted-foreground" />
                Danger zone
              </CardTitle>
              <CardDescription>
                Deleting your account permanently removes every chat, message,
                attachment, and credit balance. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountDialog email={kindeUser.email} />
            </CardContent>
          </Card>
        )}
      </main>
    </section>
  );
}
