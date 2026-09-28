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
import Link from "next/link";
import { DeleteAccountDialog } from "./delete-account-dialog";

export default async function UserDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { getUser } = getKindeServerSession();
  const kindeUser = await getUser();

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-background font-sans">
      route: /users/{userId} 
      <Link className="text-sm text-primary hover:underline" href={`/`}>Back to the Home Page</Link>
      <main className="flex flex-1 w-full max-w-6xl flex-col items-center gap-5 py-32 px-16 bg-card sm:items-start">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
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

        {kindeUser?.email && (
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>
                Deleting your account removes every chat, message, attachment,
                and credit. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountDialog email={kindeUser.email} />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
