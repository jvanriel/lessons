import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth";
import { getPublishedPros, getExistingProRelationships } from "./actions";
import ChoosePros from "./ChoosePros";
import { getLocale } from "@/lib/locale";

export const metadata = { title: "Choose Your Pros — Golf Lessons" };

interface Props {
  searchParams: Promise<{ pro?: string }>;
}

export default async function ChooseProsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || !hasRole(session, "member")) {
    redirect("/login");
  }

  const { pro } = await searchParams;
  const preSelectedId = pro ? parseInt(pro) : null;

  const [pros, existingProIds, locale] = await Promise.all([
    getPublishedPros(),
    getExistingProRelationships(),
    getLocale(),
  ]);

  return (
    <ChoosePros
      pros={pros}
      preSelectedId={preSelectedId && !isNaN(preSelectedId) ? preSelectedId : null}
      existingProIds={existingProIds}
      locale={locale}
    />
  );
}
