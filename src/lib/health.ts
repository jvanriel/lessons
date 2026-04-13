import { neon } from "@neondatabase/serverless";
import { list } from "@vercel/blob";
import { getStripe } from "@/lib/stripe";
import { JWT } from "google-auth-library";

export interface HealthCheck {
  ok: boolean;
  ms?: number;
  error?: string;
  note?: string;
}

export interface HealthResult {
  status: "ok" | "degraded";
  deploy: string | null;
  env: string;
  timestamp: string;
  checks: Record<string, HealthCheck>;
}

async function timed<T>(
  name: string,
  fn: () => Promise<T>
): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Individual checks ─────────────────────────────────

async function checkDatabase(): Promise<HealthCheck> {
  return timed("db", async () => {
    const url =
      process.env.POSTGRES_URL_PREVIEW_NON_POOLING ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_URL;
    if (!url) throw new Error("No postgres URL configured");
    const sql = neon(url);
    const rows = (await sql.query("SELECT 1 AS ok")) as { ok: number }[];
    if (rows[0]?.ok !== 1) throw new Error("SELECT 1 returned wrong value");
  });
}

async function checkStripe(): Promise<HealthCheck> {
  return timed("stripe", async () => {
    if (!process.env.STRIPE_SECRET_KEY)
      throw new Error("STRIPE_SECRET_KEY not set");
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new Error("STRIPE_WEBHOOK_SECRET not set");
    if (!process.env.STRIPE_PRICE_MONTHLY)
      throw new Error("STRIPE_PRICE_MONTHLY not set");
    if (!process.env.STRIPE_PRICE_ANNUAL)
      throw new Error("STRIPE_PRICE_ANNUAL not set");
    const stripe = getStripe();
    // Cheap Stripe call — retrieves platform balance (no args required)
    await stripe.balance.retrieve();
  });
}

async function checkBlob(): Promise<HealthCheck> {
  return timed("blob", async () => {
    if (!process.env.BLOB_READ_WRITE_TOKEN)
      throw new Error("BLOB_READ_WRITE_TOKEN not set");
    await list({ limit: 1 });
  });
}

/**
 * Verify the Google service account credentials parse and authorize WITHOUT
 * sending an email. Catches the env-var format issues we hit on 2026-04-13
 * (DECODER routines::unsupported, invalid_client) at deploy time instead of
 * waiting for Sentry to surface them in production.
 */
async function checkGmail(): Promise<HealthCheck> {
  return timed("gmail", async () => {
    const rawEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!rawEmail) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL not set");
    if (!rawKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not set");

    const stripQuotes = (v: string) => {
      const t = v.trim();
      return (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))
        ? t.slice(1, -1).trim()
        : t;
    };

    const email = stripQuotes(rawEmail);
    const key = stripQuotes(rawKey).replace(/\\n/g, "\n");

    if (!email.includes("@") || !email.endsWith(".gserviceaccount.com")) {
      throw new Error(
        `service account email looks malformed: ${email.slice(0, 24)}...`
      );
    }
    if (!key.includes("BEGIN PRIVATE KEY") && !key.includes("BEGIN RSA PRIVATE KEY")) {
      throw new Error("private key missing BEGIN PRIVATE KEY header");
    }

    const auth = new JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: stripQuotes(process.env.GMAIL_SEND_AS || "noreply@golflessons.be"),
    });

    // authorize() exchanges the JWT for an access token. This actually hits
    // Google's OAuth2 token endpoint, so a malformed key (DECODER error) or
    // unknown service account (invalid_client) will fail right here.
    await auth.authorize();
  });
}

function checkSentry(): HealthCheck {
  const configured =
    !!process.env.NEXT_PUBLIC_SENTRY_DSN && !!process.env.SENTRY_ORG;
  return {
    ok: configured,
    note: configured
      ? "DSN + ORG configured"
      : "NEXT_PUBLIC_SENTRY_DSN or SENTRY_ORG missing",
  };
}

function checkCriticalEnv(): HealthCheck {
  const required = [
    "AUTH_SECRET",
    "BLOB_READ_WRITE_TOKEN",
    "STRIPE_SECRET_KEY",
    "VAPID_PRIVATE_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return { ok: false, error: `missing: ${missing.join(", ")}` };
  }
  return { ok: true, note: `all ${required.length} vars present` };
}

// ─── Main runner ───────────────────────────────────────

export async function runHealthChecks(
  opts: { deep?: boolean } = {}
): Promise<HealthResult> {
  const timestamp = new Date().toISOString();
  const deploy = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? null;
  const env = process.env.VERCEL_ENV ?? "development";

  // Always run: fast, cheap checks
  const [db, env_, sentry] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkCriticalEnv()),
    Promise.resolve(checkSentry()),
  ]);

  const checks: Record<string, HealthCheck> = { db, env: env_, sentry };

  // Deep checks: Stripe + Blob + Gmail — heavier external calls, only on request
  if (opts.deep) {
    const [stripe, blob, gmail] = await Promise.all([
      checkStripe(),
      checkBlob(),
      checkGmail(),
    ]);
    checks.stripe = stripe;
    checks.blob = blob;
    checks.gmail = gmail;
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return {
    status: ok ? "ok" : "degraded",
    deploy,
    env,
    timestamp,
    checks,
  };
}
