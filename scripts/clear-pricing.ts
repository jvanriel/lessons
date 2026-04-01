import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";

async function main() {
  const db = drizzle(neon(process.env.POSTGRES_URL!), { schema });
  await db.update(schema.proProfiles).set({ pricePerHour: null });
  await db.update(schema.proLocations).set({ priceIndication: null });
  console.log("Pricing cleared");
}

main();
