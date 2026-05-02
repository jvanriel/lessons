import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { formatDate } from "@/lib/format-date";
import { getAllFeedback } from "@/app/feedback/actions";
import FeedbackAdminRow from "./FeedbackAdminRow";

export const metadata = { title: "Feedback — Admin — Golf Lessons" };

interface Props {
  searchParams: Promise<{ status?: string; id?: string }>;
}

const STATUS_FILTERS = ["new", "in_progress", "responded", "closed"] as const;

export default async function AdminFeedbackPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) redirect("/login");

  const locale = await getLocale();
  const { status: statusParam, id: idParam } = await searchParams;
  const validStatus =
    statusParam && (STATUS_FILTERS as readonly string[]).includes(statusParam)
      ? statusParam
      : undefined;

  const rows = await getAllFeedback(validStatus);
  const expandedId = idParam ? parseInt(idParam, 10) : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/admin"
        className="text-sm text-green-600 hover:text-green-700"
      >
        ← Admin
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-green-900">
        Feedback
      </h1>
      <p className="mt-2 text-sm text-green-600">
        User-submitted feedback. Submitting fans out an admin notification
        and emails contact@golflessons.be. Responding emails the user
        back in their preferred locale.
      </p>

      {/* Status filter pills */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/feedback"
          className={`rounded-full px-3 py-1 text-xs ${
            !validStatus
              ? "bg-green-700 text-white"
              : "bg-green-50 text-green-700 hover:bg-green-100"
          }`}
        >
          All ({rows.length}
          {validStatus ? "" : ""})
        </Link>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={`/admin/feedback?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs capitalize ${
              validStatus === s
                ? "bg-green-700 text-white"
                : "bg-green-50 text-green-700 hover:bg-green-100"
            }`}
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <p className="mt-8 rounded-md border border-green-200 bg-white px-4 py-3 text-sm text-green-600">
          No feedback {validStatus ? `with status "${validStatus}"` : "yet"}.
        </p>
      ) : (
        <ol className="mt-6 space-y-4">
          {rows.map((r) => (
            <FeedbackAdminRow
              key={r.id}
              row={{
                ...r,
                createdAt: r.createdAt.toISOString(),
                respondedAt: r.respondedAt?.toISOString() ?? null,
              }}
              startExpanded={expandedId === r.id}
              locale={locale}
              formatLine={`${formatDate(r.createdAt, locale, {
                dateStyle: "medium",
                timeStyle: "short",
              })}`}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
