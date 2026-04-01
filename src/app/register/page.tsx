import { getLocale } from "@/lib/locale";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "Register — Golf Lessons" };

export default async function RegisterPage() {
  const locale = await getLocale();
  return <RegisterForm locale={locale} />;
}
