import { requireProProfile } from "@/lib/pro";
import { getMailingContacts, getProFlyerPages } from "./actions";
import MailingManager from "./MailingManager";

export const metadata = { title: "Mailings — Golf Lessons" };

export default async function ProMailingsPage() {
  const { profile } = await requireProProfile();

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          Mailings
        </h1>
        <p className="mt-4 text-green-600">
          No pro profile found. Contact an administrator.
        </p>
      </div>
    );
  }

  const contacts = await getMailingContacts();
  const flyerPages = await getProFlyerPages();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-green-900">
        Mailings
      </h1>
      <p className="mt-2 text-sm text-green-600">
        Send emails to your students and contacts.
      </p>
      <MailingManager contacts={contacts} flyerPages={flyerPages} />
    </div>
  );
}
