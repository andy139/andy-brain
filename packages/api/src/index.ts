import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import ingestRoute from "./routes/ingest.js";
import queryRoute from "./routes/query.js";
import entriesRoute from "./routes/entries.js";
import quickIngestRoute from "./routes/quickIngest.js";
import pdfIngestRoute from "./routes/pdfIngest.js";
import portfolioQueryRoute from "./routes/portfolioQuery.js";

const app = new Hono();

app.use("*", logger());
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()) : []),
];

// Portfolio endpoint is public — handled with its own * CORS headers
app.use(
  /^(?!\/api\/portfolio)/,
  cors({
    origin: allowedOrigins.length > 0
      ? (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0])
      : "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-api-key"],
  })
);

app.route("/api", ingestRoute);
app.route("/api", quickIngestRoute);
app.route("/api", pdfIngestRoute);
app.route("/api", queryRoute);
app.route("/api", entriesRoute);
app.route("/api", portfolioQueryRoute);

app.get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }));

export default app;
