import {
  LoginLink,
  LogoutLink,
  RegisterLink,
} from "@kinde-oss/kinde-auth-nextjs/components";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { getUser } from "@/lib/user";

export type SiteNavProps = {
  /** Rendered in its own full-width row above the nav (the `route:` line). */
  above?: React.ReactNode;
  /** Rendered after the brand, before the controls — a chat title, e.g. */
  children?: React.ReactNode;
  /** Extra controls pushed into the right-hand group, e.g. a chat's menu. */
  actions?: React.ReactNode;
  /**
   * Where "Dashboard" points. Pages under `/users/[userId]` already know their
   * own id and pass it; elsewhere it falls back to the signed-in user's row.
   */
  dashboardHref?: string;
  className?: string;
};

/**
 * The site navbar, shared by the landing page and every page under
 * `/users/[userId]`.
 *
 * Three named slots instead of one `children` prop, because the pages need
 * different things in different places: the dashboard prints its `route:` line
 * *above* the bar, a chat prints its title *after* the brand, and a chat's
 * rename/delete menu belongs in the right-hand control group.
 */
export async function SiteNav({
  above,
  children,
  actions,
  dashboardHref,
  className,
}: SiteNavProps) {
  const { isAuthenticated, getUser: getKindeUser } = getKindeServerSession();
  const isLoggedIn = await isAuthenticated();
  const kindeUser = isLoggedIn ? await getKindeUser() : null;

  // A Kinde session can outlive its local row, so fall back to the sync route
  // rather than linking to `/users/undefined`. Sync mints the row and redirects
  // on to the chats page.
  let dashboardTarget = dashboardHref;
  if (!dashboardTarget) {
    const localUser = kindeUser ? await getUser(kindeUser.id) : null;
    dashboardTarget = localUser ? `/users/${localUser.id}/` : "/api/auth/sync";
  }

  return (
    <header
      className={
        className ??
        "sticky top-0 z-20 w-full border-b border-border bg-background/90 backdrop-blur-sm"
      }
    >
      <div className="mx-auto flex w-full flex-col px-4 py-2.5 sm:px-6">
        {above}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-sm font-semibold text-foreground">
                BotChain AI
              </span>
            </Link>
            {children}
          </div>

          <nav className="flex shrink-0 items-center gap-2">
            <ModeToggle />
            {actions}
            {isLoggedIn ? (
              <>
                <Link
                  href={dashboardTarget}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Dashboard
                </Link>
                <LogoutLink className={buttonVariants({ variant: "outline" })}>
                  Log out
                </LogoutLink>
              </>
            ) : (
              <>
                <LoginLink className={buttonVariants({ variant: "default" })}>
                  Log in
                </LoginLink>
                <RegisterLink
                  className={buttonVariants({ variant: "outline" })}
                >
                  Sign up
                </RegisterLink>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}