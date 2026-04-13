import { getSession, hasRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import AIPanel from "@/components/toolbox/ai/AIPanel";

export const metadata = { title: "AI Assistant — Golf Lessons" };

export default async function AIPage() {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        AI Assistant
      </h1>
      <p className="mt-2 text-green-700">
        Chat with the AI assistant for content, translation, and platform help.
      </p>
      <div className="mt-8 rounded-xl border border-green-200 bg-green-950 shadow-sm overflow-hidden" style={{ height: "calc(100dvh - 280px)" }}>
        <AIPanel />
      </div>
    </div>
  );
}
