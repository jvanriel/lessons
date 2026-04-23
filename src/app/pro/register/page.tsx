import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import RegisterProForm from "./RegisterProForm";

export const metadata = { title: "Become a Pro — Golf Lessons" };

export default async function ProRegisterPage() {
  const session = await getSession();

  // Already a pro? Send them on — the onboarding wizard handles both
  // unfinished and finished pros (redirects to dashboard when done).
  if (session && hasRole(session, "pro")) {
    redirect("/pro/onboarding");
  }

  // Already an admin? Send them to admin.
  if (session && (hasRole(session, "admin") || hasRole(session, "dev"))) {
    redirect("/admin");
  }

  // Already a student? They need to log out and re-register, or upgrade
  // (manual flow for now). Send to dashboard with a hint.
  if (session && hasRole(session, "member")) {
    redirect("/member/dashboard");
  }

  const locale = await getLocale();

  return <RegisterProForm locale={locale} />;
}
