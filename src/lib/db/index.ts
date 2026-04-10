import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Production uses POSTGRES_URL. Preview deployments require POSTGRES_URL_PREVIEW
// to prevent accidental writes to the production database.
// Local dev uses POSTGRES_URL_PREVIEW if available, otherwise POSTGRES_URL.
const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | undefined (local)

let databaseUrl: string;
if (vercelEnv === "production") {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is not set for production");
  databaseUrl = process.env.POSTGRES_URL;
} else if (vercelEnv === "preview") {
  if (!process.env.POSTGRES_URL_PREVIEW) throw new Error("POSTGRES_URL_PREVIEW is not set for preview — refusing to fall back to production DB");
  databaseUrl = process.env.POSTGRES_URL_PREVIEW;
} else {
  // Local development
  databaseUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL || "";
  if (!databaseUrl) throw new Error("No database URL configured. Set POSTGRES_URL_PREVIEW or POSTGRES_URL in .env.local");
}
const sql = neon(databaseUrl);
export const db = drizzle(sql, { schema });
