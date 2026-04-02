import type { MiddlewareHandler } from "hono";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const provided = c.req.header("x-api-key");
  const expected = process.env.AUTH_TOKEN;

  if (!expected) {
    return c.json({ error: "Server misconfigured: AUTH_TOKEN not set" }, 500);
  }
  if (!provided || provided !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
