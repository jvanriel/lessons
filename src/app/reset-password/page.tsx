import { getLocale } from "@/lib/locale";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = { title: "Reset Password — Golf Lessons" };

export default async function ResetPasswordPage() {
  const locale = await getLocale();
  return <ResetPasswordForm locale={locale} />;
}
