/**
 * Vercel serverless entry point.
 * Node.js runtime (no edge) — required for jsdom/readability in the ingest route.
 */
import { handle } from "@hono/node-server/vercel";
import app from "../src/index.js";

export default handle(app);
