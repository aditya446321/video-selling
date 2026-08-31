# Video Selling

A digital video store with a public storefront and a private admin CMS, backed by a single
persistent SQLite database. Anything changed in the admin panel — prices, packages, groups,
offers, FAQ, UPI ID, Telegram/support details — is immediately reflected on the public site.

No Supabase, Firebase, or other external database service. No Docker, Redis, or extra
frameworks. Just Express + SQLite.

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

### Any persistent Node host (recommended) — Render, Railway, Fly.io, a VPS, etc.
Set the environment variables above in the host's dashboard, then run `npm install && npm start`.
This is the recommended path: SQLite needs a writable, persistent disk, which these hosts provide.

### Vercel
`vercel.json` points to `api/index.js`, which serves the same Express app as a serverless
function. **Important:** Vercel's filesystem is ephemeral and read-only outside `/tmp`, so the
SQLite database will not reliably persist across deployments or cold starts there. Vercel works
fine for trying the app out, but for real production data use a persistent Node host instead.

### Netlify
Netlify's function runtime has the same ephemeral-filesystem limitation as Vercel, so it isn't a
good fit for a SQLite-backed app either. If you want to use Netlify, point it at a persistent
Node host running the API (via a redirect/proxy) rather than running the database inside a
Netlify Function.

### Local development
```bash
npm install
npm run dev
```

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
