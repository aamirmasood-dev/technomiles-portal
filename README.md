# Technomiles Accounts Hub

Requirements and business rules: see [CLAUDE.md](CLAUDE.md).

## Local setup

1. MySQL running locally (`brew services start mysql`) with a `technomiles` database and user.
2. Copy `.env.example` to `.env.local` and fill in the values.
3. `npm install`
4. `npm run db:migrate` to create the tables
5. `npm run create-user -- you@example.com "Your Name"` (prompts for a password, min 10 characters; run again to reset it)
6. `npm run dev` and open http://localhost:3100

## Scripts

- `npm run dev` / `npm run build` / `npm start` (honours `$PORT`)
- `npm test` for unit tests
- `npm run db:generate` after changing `src/db/schema.ts`, then `npm run db:migrate`
- `npm run seed-clients` / `npm run seed-company` add the default clients, partners, bank account and staff (safe to re-run)
- `npm run demo -- add|remove` loads or removes the Aug 2026 demo data
- Deployment: see [DEPLOY.md](DEPLOY.md)
