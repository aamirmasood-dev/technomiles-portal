// Creates the company defaults if missing: the two partners (50/50), the Albaraka Bank (PKR) account
// and the staff (Nouman, Hassan on salary; Ehsaan on 1% of Kensingtons Amazon + eBay net sales).
// Safe to run more than once.
import { config } from "dotenv";
import mysql from "mysql2/promise";

config({ path: ".env.local" });
config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [p] = await conn.query("SELECT COUNT(*) AS n FROM partners");
  if ((p as { n: number }[])[0].n === 0) {
    await conn.execute("INSERT INTO partners (name, share_bps) VALUES ('Aamir Masood', 5000), ('Imran Anwar Awan', 5000)");
    console.log("Added partners Aamir Masood and Imran Anwar Awan (50/50).");
  }
  const [a] = await conn.query("SELECT COUNT(*) AS n FROM company_accounts");
  if ((a as { n: number }[])[0].n === 0) {
    await conn.execute("INSERT INTO company_accounts (name, currency, opening_balance, opening_date) VALUES ('Albaraka Bank', 'PKR', 0, '2026-10-01')");
    console.log("Added company account Albaraka Bank (PKR), opening 2026-10-01.");
  }
  const [st] = await conn.query("SELECT COUNT(*) AS n FROM staff_members");
  if ((st as { n: number }[])[0].n === 0) {
    const [k] = await conn.query("SELECT id FROM clients WHERE name = 'Kensingtons'");
    const kid = (k as { id: number }[])[0]?.id ?? null;
    const [ks] = kid ? await conn.query("SELECT id FROM stores WHERE client_id = ? AND platform IN ('AMAZON','EBAY') ORDER BY id", [kid]) : [[]];
    const storeIds = (ks as { id: number }[]).map((r) => r.id);
    await conn.execute(
      `INSERT INTO staff_members (name, job_title, pay_type, monthly_salary, commission_bps, commission_client_id, commission_store_ids) VALUES
       ('Nouman Nawaz', NULL, 'SALARY', 7000000, NULL, NULL, NULL),
       ('Hassan Chohan', NULL, 'SALARY', 1500000, NULL, NULL, NULL),
       ('Ehsaan Latif', 'eBay & Amazon Specialist', 'COMMISSION', NULL, 100, ?, ?)`,
      [kid, JSON.stringify(storeIds)],
    );
    console.log(`Added staff: Nouman (PKR 70,000), Hassan (PKR 15,000), Ehsaan (1% of ${storeIds.length} Kensingtons stores).`);
  }
  await conn.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
