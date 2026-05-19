// Search PRODUCTION DB for the Leerling3 user from Nadine's screenshot.
// Bypasses the default Drizzle client (which targets POSTGRES_URL_PREVIEW).
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL not set");
  const sql = neon(url);
  const rows = await sql`
    SELECT id, email, first_name, last_name
    FROM users
    WHERE email ILIKE '%leerling%' OR first_name ILIKE '%leerling%'
  `;
  for (const r of rows) console.log(r);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
