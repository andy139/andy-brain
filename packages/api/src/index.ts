import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import ingestRoute from "./routes/ingest.js";
import queryRoute from "./routes/query.js";
import entriesRoute from "./routes/entries.js";
import quickIngestRoute from "./routes/quickIngest.js";
import pdfIngestRoute from "./routes/pdfIngest.js";
import portfolioQueryRoute from "./routes/portfolioQuery.js";
import suggestionsRoute from "./routes/suggestions.js";
import { supabase } from "./lib/supabase.js";
import { getPineconeIndex } from "./lib/pinecone.js";
import { rateLimiter } from "./middleware/rateLimit.js";

const app = new Hono();

app.use("*", logger());
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()) : []),
];

app.use(
  "*",
  cors({
    // Known origins get reflected back; everything else gets * (auth routes
    // are protected by token, not CORS, so this is safe)
    origin: allowedOrigins.length > 0
      ? (origin) => (allowedOrigins.includes(origin) ? origin : "*")
      : "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-api-key"],
  })
);

app.route("/api", ingestRoute);
app.route("/api", quickIngestRoute);
app.route("/api", pdfIngestRoute);

// Apply rate limiting to /api/query: max 10 requests per minute per IP
const queryRateLimit = rateLimiter(10, 60_000);
app.use("/api/query", queryRateLimit);

app.route("/api", queryRoute);
app.route("/api", entriesRoute);
app.route("/api", portfolioQueryRoute);
app.route("/api", suggestionsRoute);

app.get("/health", async (c) => {
  const ts = new Date().toISOString();

  // Ping Supabase
  let supabaseStatus: "ok" | "error" = "ok";
  let supabaseError: string | undefined;
  try {
    const { error } = await supabase
      .from("knowledge_entries")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) {
      supabaseStatus = "error";
      supabaseError = error.message;
    }
  } catch (err) {
    supabaseStatus = "error";
    supabaseError = err instanceof Error ? err.message : "Unknown error";
  }

  // Ping Pinecone
  let pineconeStatus: "ok" | "error" = "ok";
  let pineconeError: string | undefined;
  try {
    const index = getPineconeIndex();
    await index.describeIndexStats();
  } catch (err) {
    pineconeStatus = "error";
    pineconeError = err instanceof Error ? err.message : "Unknown error";
  }

  const allOk = supabaseStatus === "ok" && pineconeStatus === "ok";

  return c.json(
    {
      status: allOk ? "ok" : "degraded",
      ts,
      services: {
        supabase: { status: supabaseStatus, ...(supabaseError && { error: supabaseError }) },
        pinecone: { status: pineconeStatus, ...(pineconeError && { error: pineconeError }) },
      },
    },
    allOk ? 200 : 503
  );
});

export default app;
