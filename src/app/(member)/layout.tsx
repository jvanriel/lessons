import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !(hasRole(session, "member") || hasRole(session, "admin") || hasRole(session, "dev"))) {
    redirect("/login");
  }
  return <>{children}</>;
}
