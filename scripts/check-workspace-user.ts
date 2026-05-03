/**
 * Probe Workspace for user existence by attempting service-account
 * impersonation. If the JWT exchange succeeds, Google recognises the
 * address as a real user (primary or alias). If it fails with
 * "invalid_grant: Invalid email or User ID", the address doesn't
 * resolve to anyone in the directory.
 *
 * Usage:
 *   pnpm dlx dotenv-cli -e .env.local -- pnpm tsx scripts/check-workspace-user.ts <email> [<email> ...]
 *
 * Defaults to a useful set of probes when invoked with no args.
 */
import { JWT } from "google-auth-library";

const DEFAULT_TARGETS = [
  "jan.vanriel@silverswing.golf",
  "jan.vanriel@golflessons.be",
  "noreply@silverswing.golf",
  "noreply@golflessons.be",
  "it.admin@silverswing.golf",
  "it.admin@golflessons.be",
];

async function probe(target: string) {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    subject: target,
  });
  try {
    await auth.authorize();
    console.log(`✓ ${target}  exists (impersonation OK)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`✗ ${target}  ${msg}`);
  }
}

async function main() {
  const targets = process.argv.slice(2);
  const list = targets.length > 0 ? targets : DEFAULT_TARGETS;
  for (const t of list) await probe(t);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
