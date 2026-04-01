import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.POSTGRES_URL!);
  const rows = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cms_blocks' ORDER BY ordinal_position`;
  console.log("cms_blocks columns:");
  for (const r of rows) {
    console.log(`  ${r.column_name} (${r.data_type})`);
  }
}

main();
