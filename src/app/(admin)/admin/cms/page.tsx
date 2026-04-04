import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import CmsEditorPage from "./CmsEditorPage";

export const metadata = { title: "CMS — Golf Lessons" };

export default async function CmsPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) redirect("/login");

  return <CmsEditorPage />;
}
