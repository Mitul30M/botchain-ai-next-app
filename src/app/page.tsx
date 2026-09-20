import {
  LoginLink,
  LogoutLink,
  RegisterLink,
} from "@kinde-oss/kinde-auth-nextjs/components";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { getUser } from "@/lib/user";
import Link from "next/link";

export default async function Home() {
  const { isAuthenticated, getUser: getKindeUser } = getKindeServerSession();
  const isLoggedIn = await isAuthenticated();
  const kindeUser = isLoggedIn ? await getKindeUser() : null;
  const localUser = kindeUser ? await getUser(kindeUser.id) : null;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-background font-sans">
      route: /
      <main className="flex flex-1 w-full max-w-6xl flex-col items-center justify-between py-32 px-16 bg-card sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            BotChain AI - Next.js App
          </h1>
          <p className="max-w-md text-lg leading-8 text-muted-foreground">
            Welcome to the BotChain AI - Next.js App
          </p>
          {isLoggedIn ? (
            <p className="max-w-md flex flex-col gap-4 text-lg leading-8 text-muted-foreground">
              <span>Hello, <Link className="font-medium text-foreground hover:underline" href={`/users/${localUser?.id}`}>{kindeUser?.given_name}</Link></span>
              <LogoutLink className="font-medium text-destructive">
                LogOut
              </LogoutLink>
            </p>
          ) : (
            <p className="max-w-md flex gap-4 text-lg leading-8 text-muted-foreground">
              <LoginLink className="font-medium text-foreground">
                SignIn
              </LoginLink>
              <RegisterLink className="font-medium text-foreground">
                SignUp
              </RegisterLink>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
