import { Skeleton } from "@/components/ui/skeleton";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { createChatAction } from "./actions";
import { formatDate } from "@/lib/dates";
import { getUser } from "@/lib/user";

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
    <div className="flex flex-col flex-1 items-center justify-center bg-background font-sans">
      route: /users/{userId}/chats
      <div className="flex w-full max-w-6xl items-center justify-between px-16">
        <Link href={`/users/${userId}`} className="text-sm text-primary hover:underline">
          Back to Dashboard
        </Link>
        <form action={createChatAction}>
          <Button type="submit">New Chat</Button>
        </form>
      </div>
      <main className="flex flex-1 w-full max-w-6xl flex-col items-center gap-5 py-32 px-16 bg-card sm:items-start">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
          {kindeUser ? (
            `${kindeUser.given_name}'s Chats`
          ) : (
            <Skeleton className="h-6 w-32" />
          )}
        </h1>
        {chats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No chats yet. Create one to start planning an automation.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 w-full">
            {chats.map((chat) => (
              <Card size="sm" className="" key={chat.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{chat.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 py-2 text-sm font-medium">
                    <li className="flex gap-2">
                      <span>model: {chat.model}</span>
                    </li>
                    <li className="flex gap-2">
                      <span>created: {formatDate(chat.createdAt)}</span>
                    </li>
                    <li className="flex gap-2">
                      <span>updated: {formatDate(chat.updatedAt)}</span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Link
                    href={`/users/${userId}/chats/${chat.id}`}
                    className="w-full"
                  >
                    <Button className="w-full" variant="ghost">
                      View Chat
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
