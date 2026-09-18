import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import Link from "next/link";

export default async function UserDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { getUser } = getKindeServerSession();
  const kindeUser = await getUser();

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      route: /users/{userId} 
      <Link className="text-sm text-blue-500 hover:underline" href={`/`}>Back to the Home Page</Link>
      <main className="flex flex-1 w-full max-w-6xl flex-col items-center gap-5 py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-primary dark:text-zinc-50">
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
            `Kinde User ID: ${kindeUser.id}`
          ) : (
            <Skeleton className="h-4 w-48" />
          )}
        </p>
        <p className="">
          {kindeUser ? (
            `Neon Postgres ID: ${userId}`
          ) : (
            <Skeleton className="h-4 w-48" />
          )}
        </p>
        <Link
          href={`/users/${userId}/chats`}
        >
          <Button className="w-full">
            View Chats
          </Button>
        </Link>
      </main>
    </div>
  );
}
