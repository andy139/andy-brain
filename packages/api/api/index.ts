/**
 * Vercel serverless entry point.
 * Node.js runtime (no edge) — required for jsdom/readability in the ingest route.
 *
 * Custom handler that manually buffers the body so Hono can parse it,
 * since Vercel's runtime interferes with the body stream before passing
 * it to @hono/node-server adapters.
 */
import type { IncomingMessage, ServerResponse } from "http";
import { Readable } from "stream";
import app from "../src/index.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const protocol =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  const init: RequestInit & { duplex?: string } = {
    method: req.method ?? "GET",
    headers: req.headers as Record<string, string>,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });
    if (chunks.length > 0) {
      init.body = Buffer.concat(chunks);
    }
  }

  const request = new Request(url.toString(), init);

  let response: Response;
  try {
    response = await app.fetch(request);
  } catch (err) {
    console.error("Handler error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(err) }));
    return;
  }

  res.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() !== "transfer-encoding") {
      res.setHeader(key, value);
    }
  }

  if (response.body) {
    // @ts-ignore — fromWeb is available in Node 18+
    const readable = Readable.fromWeb(response.body);
    readable.pipe(res);
  } else {
    res.end();
  }
}
