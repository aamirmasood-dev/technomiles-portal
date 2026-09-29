import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db, stores } from "@/db";
import { runSync } from "@/lib/sync";

// Called by the Hostinger cron job: curl -s "https://<domain>/api/cron/sync?key=$CRON_SECRET"
// Syncs stores not synced in the last 20 hours, oldest first, within a time budget,
// so an hourly cron works through all stores even if one run cannot finish them all.
const DUE_AFTER_MS = 20 * 3600000;
const BUDGET_MS = 50_000;

function keyOk(given: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!keyOk(url.searchParams.get("key"))) return new Response("Forbidden", { status: 403 });

  const due = await db
    .select({ id: stores.id, name: stores.name })
    .from(stores)
    .where(
      and(
        eq(stores.active, true),
        isNotNull(stores.credentialsEnc),
        or(isNull(stores.lastSyncAt), lt(stores.lastSyncAt, new Date(Date.now() - DUE_AFTER_MS))),
      ),
    )
    .orderBy(asc(stores.lastSyncAt));

  const started = Date.now();
  const results = [];
  for (const s of due) {
    if (Date.now() - started > BUDGET_MS) break;
    const r = await runSync(s.id);
    results.push({ store: s.name, ...r });
  }
  return Response.json({ due: due.length, synced: results.length, results });
}
