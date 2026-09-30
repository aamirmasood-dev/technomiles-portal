# Deploying to Hostinger

The live app runs at **https://admin.technomiles.com** (Hostinger account `u405516736`, Node.js web app, Node 20, Next.js).

## How it is set up
- **Database:** `u405516736_tmportal` on MariaDB 11.8 (`srv1816.hstgr.io`). The app connects as `localhost`.
  Remote access is allowed only for the office Mac's IP, for running migrations.
- **Environment variables** (set on the web app): `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`.
  Copies are in `.env.hostinger` on the Mac (never committed). **Never change `ENCRYPTION_KEY`**, or saved store credentials can no longer be read.
- **Build:** `npm run build` (`next build --webpack`; Turbopack cannot run in Hostinger's build sandbox).
- **Cron:** hourly at :05, `curl -s "https://admin.technomiles.com/api/cron/sync?key=CRON_SECRET"`.

## Deploying an update
1. Commit and push to GitHub (`main`).
2. If the change added a migration (`npm run db:generate`), apply it to the live database first:
   `set -a; source .env.hostinger; set +a; npx drizzle-kit migrate`
3. Deploy: from Claude Code with the Hostinger connector (`hosting_deploy-js-application` with a `git archive` of `HEAD`),
   or in hPanel → Websites → admin.technomiles.com → Deploy, uploading the archive.
   (To deploy automatically on every push, connect GitHub once in hPanel → Websites → Manage → Advanced → Git.)
4. Watch the build log; the site restarts automatically when the build completes.

## Fresh database
With no users, `/login` shows **First-time setup** to create the administrator. Default clients, partners, bank account and staff are added with
`npx tsx scripts/seed-clients.ts` and `npx tsx scripts/seed-company.ts` (safe to re-run).

## Migrations and MariaDB
Hostinger uses MariaDB. `npm run db:generate` runs `scripts/mariadb-compat.mjs`, which fixes SQL MariaDB rejects (`serial AUTO_INCREMENT`).
JSON columns are parsed from strings as well (MariaDB stores JSON as LONGTEXT).
