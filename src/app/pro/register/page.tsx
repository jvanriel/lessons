import { redirect } from "next/navigation";

/**
 * /pro/register is now a thin redirect into the onboarding wizard
 * (step 0 = Personal). The wizard handles both signup (no session)
 * and edit-on-revisit from a single step. Bookmarks + external
 * links to /pro/register keep working.
 */
export default function ProRegisterPage() {
  redirect("/pro/onboarding");
}
