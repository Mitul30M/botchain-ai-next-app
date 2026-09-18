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
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      route: /
      <main className="flex flex-1 w-full max-w-6xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            BotChain AI - Next.js App
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Welcome to the BotChain AI - Next.js App
          </p>
          {isLoggedIn ? (
            <p className="max-w-md flex flex-col gap-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              <span>Hello, <Link className="font-medium text-zinc-950 dark:text-zinc-50 hover:underline" href={`/users/${localUser?.id}`}>{kindeUser?.given_name}</Link></span>
              <LogoutLink className="font-medium text-red-600 dark:text-zinc-50">
                LogOut
              </LogoutLink>
            </p>
          ) : (
            <p className="max-w-md flex gap-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              <LoginLink className="font-medium text-zinc-950 dark:text-zinc-50">
                SignIn
              </LoginLink>
              <RegisterLink className="font-medium text-zinc-950 dark:text-zinc-50">
                SignUp
              </RegisterLink>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
