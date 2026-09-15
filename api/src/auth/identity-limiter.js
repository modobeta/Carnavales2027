import { createHmac, randomBytes } from "node:crypto";
import { APIError } from "better-auth/api";

// Per-process pilot limiter. All updates occur synchronously; expired entries are purged.
export function createIdentityBudget({ limit, windowMs = 15 * 60 * 1000, now = Date.now, secret = randomBytes(32) }) {
  const buckets = new Map();
  return (identity) => {
    const time = now();
    for (const [key, value] of buckets) if (value.expires <= time) buckets.delete(key);
    const key = createHmac("sha256", secret).update(identity).digest("hex");
    const bucket = buckets.get(key) ?? { count: 0, expires: time + windowMs };
    if (bucket.count >= limit) return Math.max(1, Math.ceil((bucket.expires - time) / 1000));
    bucket.count += 1;
    buckets.set(key, bucket);
    return 0;
  };
}
export function skipIdentityLimits() {
  return process.env.NODE_ENV === "test" && process.env.ENABLE_RATE_LIMIT_TESTS !== "true";
}
export function identityMiddleware({ limit, select }) {
  const consume = createIdentityBudget({ limit });
  return (req, res, next) => {
    if (skipIdentityLimits()) return next();
    const identity = select(req);
    if (!identity) return next(); // malformed input remains subject to the IP limit and endpoint validation
    const retry = consume(identity);
    if (!retry) return next();
    res.set("Retry-After", String(retry));
    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", "0");
    res.set("RateLimit-Reset", String(retry));
    return res.status(429).json({ code: "RATE_LIMIT_EXCEEDED", message: "Demasiados intentos. Intente más tarde." });
  };
}
export function createOtpSendLimiter() {
  const consume = createIdentityBudget({ limit: 3 });
  return async (sendOtp, payload) => {
    if (!skipIdentityLimits()) {
      // Better Auth resolved this user from the authenticated session / signed challenge.
      const retry = consume(String(payload.user.id ?? payload.user.email).trim().toLowerCase());
      if (retry) throw new APIError("TOO_MANY_REQUESTS", {
        code: "RATE_LIMIT_EXCEEDED", message: "Demasiados envíos de OTP. Intente más tarde.",
      }, { "Retry-After": String(retry), "RateLimit-Limit": "3", "RateLimit-Remaining": "0", "RateLimit-Reset": String(retry) });
    }
    return sendOtp(payload);
  };
}
