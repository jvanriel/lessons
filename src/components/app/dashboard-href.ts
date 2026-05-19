/**
 * Resolve the right dashboard URL for a viewer based on their roles.
 * Admin / dev users land on `/admin`, pros on `/pro/dashboard`,
 * everyone else on `/member/dashboard`. Used by the sidebar's
 * App-section Dashboard entry.
 */
export function dashboardHrefFor(roles: string[]): string {
  if (roles.includes("admin") || roles.includes("dev")) return "/admin";
  if (roles.includes("pro")) return "/pro/dashboard";
  return "/member/dashboard";
}

/**
 * Resolve the destination for the brand/logo link in the top bar and
 * public header. Each role gets its "useful home":
 *   - admin / dev → /admin
 *   - pro        → /pro/bookings (their reservations)
 *   - member     → /member/dashboard (upcoming lessons + Quick Book)
 *   - guest      → /             (public marketing home)
 *
 * (Task 80 — Nadine: clicking the logo on the public marketing page
 * was redirecting authenticated members back to their dashboard, so
 * they could never browse the public site without logging out.
 * Subsequent retest May 13: member route was `/member/book`, which
 * 404s now that the booking flow requires a `[proId]` path segment.
 * Members land on their dashboard instead.)
 */
export function brandHrefFor(roles: string[]): string {
  if (roles.includes("admin") || roles.includes("dev")) return "/admin";
  if (roles.includes("pro")) return "/pro/bookings";
  if (roles.length > 0) return "/member/dashboard";
  return "/";
}
