import { getLocale } from "@/lib/locale";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "Register — Golf Lessons" };

interface Props {
  searchParams: Promise<{ pro?: string }>;
}

export default async function RegisterPage({ searchParams }: Props) {
  const locale = await getLocale();
  const { pro } = await searchParams;
  return <RegisterForm locale={locale} proId={pro} />;
}
