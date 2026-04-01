import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) {
    redirect("/login");
  }
  return <>{children}</>;
}
