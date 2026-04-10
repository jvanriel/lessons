import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Vercel scopes POSTGRES_URL per environment (production vs preview).
// Locally, POSTGRES_URL_PREVIEW allows dev against the preview Neon branch.
const databaseUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL!;
const sql = neon(databaseUrl);
export const db = drizzle(sql, { schema });
