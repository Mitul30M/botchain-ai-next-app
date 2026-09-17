import { NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { prisma } from "@/lib/prisma";

interface UserCreateInput {
  kindeId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface CreditWalletCreateInput {
  userId: string;
  balance: string;
}

interface CreditTransactionCreateInput {
  userId: string;
  type: string;
  amount: string;
  balanceAfter: string;
}

type TransactionCallback = Parameters<typeof prisma.transaction>[0];
type TransactionClient = Parameters<TransactionCallback>[0];

export async function GET() {
  const { getUser } = getKindeServerSession();
  const kindeUser = await getUser();

  if (!kindeUser?.id || !kindeUser.email) {
    return NextResponse.redirect(new URL("/login", process.env.KINDE_SITE_URL!));
  }

  let localUser = await prisma.orm.public.User.first({
    kindeId: kindeUser.id,
  });

  if (!localUser) {
    localUser = await prisma.transaction(async (tx: TransactionClient) => {
      const created = await tx.orm.public.User.create({
        kindeId: kindeUser.id,
        email: kindeUser.email!,
        firstName: kindeUser.given_name ?? null,
        lastName: kindeUser.family_name ?? null,
      } satisfies UserCreateInput);
      await tx.orm.public.CreditWallet.create({
        userId: created.id,
        balance: "5.00",
      } satisfies CreditWalletCreateInput);
      await tx.orm.public.CreditTransaction.create({
        userId: created.id,
        type: "signup_grant",
        amount: "5.00",
        balanceAfter: "5.00",
      } satisfies CreditTransactionCreateInput);
      return created;
    });
  }

  return NextResponse.redirect(
    new URL(`/users/${localUser.id}/chats`, process.env.KINDE_SITE_URL!)
  );
}
