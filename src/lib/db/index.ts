import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const isProduction = process.env.VERCEL_ENV === "production";
const databaseUrl = !isProduction && process.env.POSTGRES_URL_PREVIEW
  ? process.env.POSTGRES_URL_PREVIEW
  : process.env.POSTGRES_URL!;
const sql = neon(databaseUrl);
export const db = drizzle(sql, { schema });
