import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import ingestRoute from "./routes/ingest.js";
import queryRoute from "./routes/query.js";
import entriesRoute from "./routes/entries.js";
import quickIngestRoute from "./routes/quickIngest.js";
import pdfIngestRoute from "./routes/pdfIngest.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.ALLOWED_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-api-key"],
  })
);

app.route("/api", ingestRoute);
app.route("/api", quickIngestRoute);
app.route("/api", pdfIngestRoute);
app.route("/api", queryRoute);
app.route("/api", entriesRoute);

app.get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }));

export default app;
