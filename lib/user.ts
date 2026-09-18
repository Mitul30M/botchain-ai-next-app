'use server';

import { prisma } from '@/lib/prisma';

export async function getUser(userId: string) {
  const user = await prisma.orm.public.User
    .where((u) => u.kindeId.eq(userId))
    .include("chats", (chat) =>
      chat
        .select("id", "title", "createdAt", "updatedAt", "model")
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
