/**
 * Resolve the right dashboard URL for a viewer based on their roles.
 * Admin / dev users land on `/admin`, pros on `/pro/dashboard`,
 * everyone else on `/member/dashboard`. Used by the sidebar's
 * App-section Dashboard entry and by the top-bar brand link so
 * clicking either always lands the user on "their home page".
 */
export function dashboardHrefFor(roles: string[]): string {
  if (roles.includes("admin") || roles.includes("dev")) return "/admin";
  if (roles.includes("pro")) return "/pro/dashboard";
  return "/member/dashboard";
}
