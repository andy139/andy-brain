import type { MiddlewareHandler } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter.
 * @param maxRequests  Maximum requests allowed in the window.
 * @param windowMs     Window duration in milliseconds.
 */
export function rateLimiter(
  maxRequests: number,
  windowMs: number
): MiddlewareHandler {
  const store = new Map<string, RateLimitEntry>();

  // Periodically prune expired entries to prevent unbounded memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, windowMs).unref();

  return async (c, next) => {
    // Use X-Forwarded-For when behind a proxy, fall back to remote address
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    // Set standard rate-limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "Too many requests. Please try again later." },
        429
      );
    }

    await next();
  };
}
