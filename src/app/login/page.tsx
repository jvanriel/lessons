import { getLocale } from "@/lib/locale";
import LoginForm from "./LoginForm";

export const metadata = { title: "Login — Golf Lessons" };

export default async function LoginPage() {
  const locale = await getLocale();
  return <LoginForm locale={locale} />;
}
