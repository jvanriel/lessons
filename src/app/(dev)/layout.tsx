import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    redirect("/login");
  }
  return <>{children}</>;
}
