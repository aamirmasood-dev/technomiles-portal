// Preloads the current clients (Kensingtons, Jawa) with stores, terms and couriers.
// Safe to run more than once: a client that already exists (by name) is skipped.
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as s from "../src/db/schema";

config({ path: ".env.local" });
config();

type StoreSeed = Omit<typeof s.stores.$inferInsert, "clientId" | "syncStartDate">;

const SYNC_FROM = "2026-10-01";
const PLATFORM_GROUPS: s.DeductionGroup[] = [
  "REFUNDS",
  "MARKETPLACE",
  "PAYMENT",
  "SHIPPING",
  "ADVERTISING",
  "SUBSCRIPTIONS",
  "OTHER_PLATFORM",
];

const SEED: {
  client: typeof s.clients.$inferInsert;
  stores: StoreSeed[];
  term: Omit<typeof s.contractTerms.$inferInsert, "clientId">;
  couriers: string[];
}[] = [
  {
    client: { name: "Kensingtons", currency: "GBP", timezone: "Europe/London", contactName: "Mr. Qasim" },
    stores: [
      { platform: "SHOPIFY", name: "Kensingtons Bedding Website", currency: "GBP", accountRef: "kensingtonsbedding.co.uk" },
      { platform: "SHOPIFY", name: "Raymat Textiles Website", currency: "GBP", accountRef: "raymattextile.co.uk" },
      { platform: "AMAZON", name: "Kensingtons Amazon", currency: "GBP", region: "EU", marketplaceId: "A1F83G8C2ARO7P" },
      { platform: "EBAY", name: "Kensingtons Bedding eBay", currency: "GBP", region: "EBAY_GB", accountRef: "kensingtons-uk" },
      { platform: "EBAY", name: "Raymat Home eBay", currency: "GBP", region: "EBAY_GB", accountRef: "raymathome" },
      { platform: "EBAY", name: "Online Bedding 4U eBay", currency: "GBP", region: "EBAY_GB", accountRef: "onlinebedding4u" },
      { platform: "EBAY", name: "Duvets Online eBay", currency: "GBP", region: "EBAY_GB" },
    ],
    term: {
      name: "Commission",
      baseLabel: "Net sale",
      rateBps: 1000,
      groups: PLATFORM_GROUPS,
      effectiveFrom: "2026-10",
    },
    couriers: ["Parcelforce", "EVRI"],
  },
  {
    client: { name: "Jawa Jewelers", currency: "USD", timezone: "America/Chicago" },
    stores: [
      { platform: "SHOPIFY", name: "Jawa Jewelers Website", currency: "USD", accountRef: "jawajewelers.com" },
      { platform: "AMAZON", name: "Jawa Amazon", currency: "USD", region: "NA", marketplaceId: "ATVPDKIKX0DER" },
      { platform: "EBAY", name: "Jawa Fashion eBay", currency: "USD", region: "EBAY_US", accountRef: "goldntime2013" },
      { platform: "EBAY", name: "Ask4Fashion eBay", currency: "USD", region: "EBAY_US" },
    ],
    term: {
      name: "Profit share",
      baseLabel: "Net profit",
      rateBps: 5000,
      groups: [...PLATFORM_GROUPS, "COGS", "PURCHASES", "OTHER_MANUAL"],
      effectiveFrom: "2026-10",
    },
    couriers: ["ShipStation"],
  },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(conn, { schema: s, mode: "default" });

  for (const entry of SEED) {
    const [existing] = await db.select().from(s.clients).where(eq(s.clients.name, entry.client.name));
    if (existing) {
      console.log(`Skipped ${entry.client.name} (already exists)`);
      continue;
    }
    await db.transaction(async (tx) => {
      const [{ id: clientId }] = await tx.insert(s.clients).values(entry.client).$returningId();
      await tx.insert(s.stores).values(entry.stores.map((st) => ({ ...st, clientId, syncStartDate: SYNC_FROM })));
      await tx.insert(s.contractTerms).values({ ...entry.term, clientId });
      await tx.insert(s.shippingProviders).values(entry.couriers.map((name) => ({ clientId, name })));
    });
    console.log(`Added ${entry.client.name}: ${entry.stores.length} stores, 1 term, ${entry.couriers.length} couriers`);
  }

  await db.insert(s.businessSettings).values({ id: 1, name: "Technomiles" }).onDuplicateKeyUpdate({ set: { id: 1 } });
  await conn.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
