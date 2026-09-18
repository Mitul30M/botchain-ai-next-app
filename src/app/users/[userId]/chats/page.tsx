import { Skeleton } from "@/components/ui/skeleton";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  // CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

export default async function ChatsPage({
  params,
}: {
  params: Promise<{ userId: string; }>;
}) {
  const { userId } = await params;
  const { getUser } = getKindeServerSession();
  const kindeUser = await getUser();

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      route: /users/{userId}/chats
      <Link href={`/users/${userId}`} className="text-sm text-blue-500 hover:underline">
        Back to Dashboard
      </Link>
      <main className="flex flex-1 w-full max-w-6xl flex-col items-center gap-5 py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          {kindeUser ? (
            `${kindeUser.given_name}'s Chats`
          ) : (
            <Skeleton className="h-6 w-32" />
          )}
        </h1>
        <div className="grid grid-cols-3 gap-4 w-full">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card size="sm" className="" key={i}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {kindeUser?.given_name}'s' Chat {i + 1}
                </CardTitle>
                {/* <CardDescription className="line-clamp-2 font-medium">
                  n8n workflow to send a daily or weekly report to your team via
                  Slack, email, or other channels.
                </CardDescription> */}
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 py-2 text-sm font-medium">
                  <li className="flex gap-2">
                    {/* <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> */}
                    <span>model: OpenAI GPT-5mini</span>
                  </li>
                  <li className="flex gap-2">
                    {/* <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> */}
                    <span>created: {new Date().toLocaleDateString()}</span>
                  </li>
                  <li className="flex gap-2">
                    {/* <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> */}
                    <span>Include charts, tables, and key metrics.</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter className="flex-col gap-2">
                <Link href={`/users/${userId}/chats/${i + 1}`} className="w-full">
                  <Button className="w-full" variant={'ghost'}>
                    View Chat
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
