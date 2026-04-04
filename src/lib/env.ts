/**
 * Environment detection utilities.
 *
 * VERCEL_ENV is set automatically by Vercel:
 *   'production' | 'preview' | 'development'
 * In local dev (pnpm dev), it is undefined.
 */

export function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function isPreview(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export function isStripeTestMode(): boolean {
  return process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ?? true;
}

/**
 * Blob path prefix — non-production uploads go under `_preview/`
 * so they can be identified and cleaned up separately.
 */
export function blobPath(path: string): string {
  const prefix = isProduction() ? "" : "_preview/";
  return `${prefix}${path}`;
}
