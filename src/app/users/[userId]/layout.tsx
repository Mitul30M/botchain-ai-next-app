import { redirect } from "next/navigation";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { prisma } from "@/lib/prisma";

export default async function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ userId: string }>;
}) {
  const { isAuthenticated, getUser } = getKindeServerSession();
  if (!(await isAuthenticated())) redirect("/login");

  const kindeUser = await getUser();
  const { userId } = await params;

  const localUser = await prisma.orm.public.User
    .where((u) => u.kindeId.eq(kindeUser!.id))
    .first();

  if (!localUser || localUser.id !== userId) {
    redirect("/");
  }

  return <>{children}</>;
}
