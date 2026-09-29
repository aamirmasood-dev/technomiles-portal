// Creates the company defaults if missing: the two partners (50/50) and the Albaraka Bank (PKR) account.
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
  await conn.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
