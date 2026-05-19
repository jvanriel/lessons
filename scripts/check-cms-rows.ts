import { db } from "@/lib/db";
import { cmsBlocks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const page = process.argv[2];
  if (!page) {
    console.error("usage: tsx scripts/check-cms-rows.ts <pageSlug>");
    process.exit(1);
  }
  const rows = await db
    .select()
    .from(cmsBlocks)
    .where(eq(cmsBlocks.pageSlug, page));
  rows.sort((a, b) =>
    a.blockKey === b.blockKey
      ? a.locale.localeCompare(b.locale)
      : a.blockKey.localeCompare(b.blockKey),
  );
  for (const r of rows) {
    console.log(`${r.locale} ${r.blockKey}: ${r.content}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
