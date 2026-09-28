import "server-only";

import { prisma } from '@/lib/prisma';

/**
 * Read-only local user lookup keyed on the Kinde `sub` (`users.kinde_id`).
 *
 * Deliberately a plain server-only data helper, not a Server Function: a
 * top-of-file `'use server'` would make every export a publicly callable
 * endpoint, and this one takes an arbitrary id and returns email, chats, and
 * wallet with no auth check of its own. Callers must resolve the Kinde session
 * first and pass the session's own `sub` — never a value from the browser.
 */
export async function getUser(userId: string) {
  const user = await prisma.orm.public.User
    .where((u) => u.kindeId.eq(userId))
    .include("chats", (chat) =>
      chat
        .select("id", "title", "createdAt", "updatedAt", "model", "deletedAt")
        .orderBy((c) => c.createdAt.desc())
    )
    .include("wallet", (w) =>
      w.select("balance", "updatedAt")
    )
    .first();

  if (!user) return null;

  return {
    id: user.id,
    kindeId: user.kindeId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    chats: user.chats,
    wallet: user.wallet,
  };
}
