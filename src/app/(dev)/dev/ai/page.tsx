import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import AIPanel from "@/components/toolbox/ai/AIPanel";
import PageHeading from "@/components/app/PageHeading";

export const metadata = { title: "AI Assistant — Golf Lessons" };

export default async function AIPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <PageHeading
        title="AI Assistant"
        subtitle="Chat with the AI assistant for content, translation, and platform help."
        helpSlug="dev.ai"
        locale="en"
      />
      <div className="mt-8 rounded-xl border border-green-200 bg-green-950 shadow-sm overflow-hidden" style={{ height: "calc(100dvh - 280px)" }}>
        <AIPanel />
      </div>
    </div>
  );
}
