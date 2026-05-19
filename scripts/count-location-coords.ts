import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.POSTGRES_URL_PREVIEW!);
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE lat IS NOT NULL) AS with_coords,
      COUNT(*) FILTER (WHERE lat IS NULL) AS without_coords
    FROM locations
  `;
  console.log("preview:", rows);

  const prodUrl = process.env.POSTGRES_URL;
  if (prodUrl) {
    const psql = neon(prodUrl);
    const prows = await psql`
      SELECT
        COUNT(*) FILTER (WHERE lat IS NOT NULL) AS with_coords,
        COUNT(*) FILTER (WHERE lat IS NULL) AS without_coords
      FROM locations
    `;
    console.log("prod:", prows);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
