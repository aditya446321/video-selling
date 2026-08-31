// Vercel serverless entry point. Imports the same Express app used by
// `npm start`, so behavior is identical between local dev and Vercel.
// NOTE: Vercel's filesystem is ephemeral/read-only outside /tmp, so the
// SQLite database will NOT persist across deployments or cold starts here.
// Use a persistent Node host (Render, Railway, Fly.io, a VPS, etc.) for
// real production data. See README.md for details.
export { default } from '../server/server.js';
