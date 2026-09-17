import { NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { prisma } from "@/lib/prisma";

const APP_URL = process.env.KINDE_SITE_URL!;

export async function GET() {
  const { getUser } = getKindeServerSession();
  const kindeUser = await getUser();

  if (!kindeUser?.id || !kindeUser.email) {
    return NextResponse.redirect(new URL("/login", APP_URL));
  }

  try {
    let localUser = await prisma.orm.public.User
      .where((u) => u.kindeId.eq(kindeUser.id))
      .first();

    if (!localUser) {
      localUser = await prisma.transaction(async (tx) => {
        const created = await tx.orm.public.User.create({
          kindeId: kindeUser.id,
          email: kindeUser.email!,
          firstName: kindeUser.given_name ?? null,
          lastName: kindeUser.family_name ?? null,
        });
        await tx.orm.public.CreditWallet.create({
          userId: created.id,
          balance: "5.00",
        });
        await tx.orm.public.CreditTransaction.create({
          userId: created.id,
          type: "signup_grant",
          amount: "5.00",
          balanceAfter: "5.00",
        });
        return created;
      });
    }

    return NextResponse.redirect(
      new URL(`/users/${localUser.id}/chats`, APP_URL)
    );
  } catch (error) {
    console.error("Auth sync failed:", error);
    return NextResponse.redirect(new URL("/login", APP_URL));
  }
}
