import { getLocale } from "@/lib/locale";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = { title: "Forgot Password — Golf Lessons" };

export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  return <ForgotPasswordForm locale={locale} />;
}
