import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.POSTGRES_URL!);
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  console.log("Tables:", rows.map(r => r.table_name));
}

main();
