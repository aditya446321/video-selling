# Video Selling

A digital video store with a public storefront and a private admin CMS, backed by a single
persistent SQLite database (via [Turso](https://turso.tech) in production, a local file in
development). Anything changed in the admin panel — prices, packages, groups, offers, FAQ, UPI
ID, Telegram/support details — is immediately reflected on the public site, permanently.

No Supabase, Firebase, Postgres, Docker, or Redis. Just Express + SQLite (via `@libsql/client`,
which speaks plain SQL and works both as a local file and as a hosted Turso database with the
same code).

## Architecture

```
Customer Browser ──▶ Public pages (index.html, etc.) ──▶ REST API (/api/*) ──▶ SQLite (data/store.db)
Admin Browser    ──▶ admin.html                     ──▶ REST API (/api/admin/*, session-protected) ──▶ same SQLite file
```

Both the public site and the admin panel read and write the same SQLite database through the
same REST API — there is no separate/local copy of the data, and nothing is stored in the
browser's `localStorage`.

- `server/server.js` — Express app: static file serving + mounts the API
- `server/db.js` — SQLite schema, seed data, settings helpers
- `server/auth.js` — bcrypt password check, signed session cookie, login rate limiting
- `server/routes/public.js` — read-only public endpoints + order submission + QR generation
- `server/routes/admin.js` — authenticated CRUD for packages/groups/offers/FAQ/orders/settings + backup
- `assets/app.js` — public site frontend, fetches everything from the API
- `assets/admin.js` — admin panel frontend, fetches/writes everything through the API

## Local setup

```bash
npm install
cp .env.example .env
npm run hash-password -- "choose-a-strong-password"
# paste the printed hash into ADMIN_PASSWORD_HASH in .env
# also set SESSION_SECRET in .env (a long random string)
npm run dev
```

Open `http://localhost:3000` for the store and `http://localhost:3000/admin.html` for the
admin panel. The SQLite database is created automatically at `data/store.db` on first run,
seeded with the existing package tiers, UPI ID, and FAQ.

Production: `npm start`

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `DATABASE_PATH` | Path to the SQLite file (default `./data/store.db`) |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password — generate with `npm run hash-password` |
| `SESSION_SECRET` | Long random string used to sign the admin session cookie |

Never commit `.env`, the generated `data/store.db`, or any real password/secret.

## Deployment

### Vercel (recommended — this is what fixes the "changes don't stick" bug)
Plain Vercel + SQLite file does **not** persist — every serverless invocation can get a fresh,
empty filesystem, so admin changes randomly appear and disappear. The fix: connect a free
**Turso** database (serverless SQLite, built for exactly this) through Vercel's dashboard —
no CLI, no terminal, works entirely from a phone browser:

1. Open your project on vercel.com → **Storage** tab → **Marketplace** (or **Create Database**)
2. Choose **Turso** → **Connect** — Vercel creates a free database and automatically adds
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to your project's environment variables
3. Redeploy (Vercel usually does this automatically after connecting)

That's it — no code changes needed, the app already checks for `TURSO_DATABASE_URL` and uses it
automatically when present. Turso's free tier (as of writing) covers far more traffic than a
small store needs.

### Any persistent Node host — Render, Railway, Fly.io, a VPS, etc.
Set `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`, then `npm install && npm start`. Without a
`TURSO_DATABASE_URL` set, the app uses a local SQLite file on that host's disk — fine as long as
the host's disk is persistent (most traditional Node hosts are; check before relying on it).

### Local development
```bash
npm install
npm run dev
```
No Turso account needed locally — it automatically uses a SQLite file at `data/store.db`.

## Backup & restore

The admin panel's **Backup** tab can export a full JSON snapshot (packages, groups, offers,
FAQ, orders, settings) and import one back in. Importing replaces existing packages, groups,
offers, and FAQ with the file's contents — export a backup first if you want to keep a copy of
the current data.

## Security notes

- Admin auth uses a bcrypt-hashed password (never store the raw password) and a signed,
  httpOnly session cookie — not a client-side PIN.
- Login attempts are rate-limited per IP.
- All admin mutation routes require a valid session; all input is validated server-side.
- Products referenced by past orders are hidden (soft-deleted) instead of removed, so order
  history stays readable.
