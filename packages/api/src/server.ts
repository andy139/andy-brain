/**
 * Local dev server — not used in Vercel deployment.
 * Run with: tsx watch src/server.ts
 */
import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`andy-brain API listening on http://localhost:${port}`);
});
