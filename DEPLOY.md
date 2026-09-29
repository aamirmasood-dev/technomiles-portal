# Deploying to Hostinger

For the owners. The app runs on Hostinger as a Node.js web app built from the private GitHub repository.

## 1. Create the database (hPanel → Databases → MySQL Databases)
Create a database and a user with a strong password. Note the host, database name, user and password.

## 2. Add the website (hPanel → Websites → Add website → Deploy Web App)
- Source: **GitHub**, repository `aamirmasood-dev/technomiles-portal`, branch `main`.
- Node.js version: 22 (or the newest offered, at least 20).
- Build command: `npm run build:hostinger`
  (creates/updates the tables, adds the default clients, partners, bank account and staff if missing, then builds)
- Start command: `npm start` (uses Hostinger's `$PORT`)
- Domain: a subdomain such as `accounts.technomiles.com`.

## 3. Environment variables (in the web app's settings)
| Name | Value |
|---|---|
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| `SESSION_SECRET` | a long random string (e.g. from `openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Never change it later, or saved store credentials can no longer be read. |
| `CRON_SECRET` | a long random string |

## 4. First sign-in
Open the site. With an empty database the login page shows **First-time setup**: create the administrator account. Add the second partner and staff users from **Settings → Users and access**.

## 5. Daily sync (hPanel → Advanced → Cron Jobs)
Every hour:
```
curl -s "https://accounts.technomiles.com/api/cron/sync?key=YOUR_CRON_SECRET"
```
Each call syncs the stores not synced in the last 20 hours.

## 6. Before real use
- Reconnect each store on its Stores page (credentials saved on a laptop are not copied).
- In **Company accounts**, record the opening balances (partners, Albaraka Bank) for 1 October 2026.
- The August demo data only exists on the laptop; the live database starts clean.
