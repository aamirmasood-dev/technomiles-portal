// Run after `drizzle-kit generate`: makes generated migrations valid on MariaDB (Hostinger).
// MariaDB rejects `serial AUTO_INCREMENT` because SERIAL already implies AUTO_INCREMENT.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

let changed = 0;
for (const f of readdirSync("drizzle").filter((n) => n.endsWith(".sql"))) {
  const path = `drizzle/${f}`;
  const sql = readFileSync(path, "utf8");
  const fixed = sql.replaceAll("serial AUTO_INCREMENT", "serial");
  if (fixed !== sql) {
    writeFileSync(path, fixed);
    changed++;
  }
}
console.log(`MariaDB compatibility: ${changed} migration file(s) adjusted.`);
