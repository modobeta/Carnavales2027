import { readTrustProxy } from "./trust-proxy.js";
import { validateEmailConfig } from "../email/delivery.js";

export function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== "production") return;
  readTrustProxy(env);
  validateEmailConfig(env);
  for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "FRONTEND_URL"]) {
    if (!env[key]?.trim()) throw new Error(`Missing production configuration: ${key}`);
  }
  if (env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  for (const key of ["BETTER_AUTH_URL", "FRONTEND_URL"]) {
    const url = new URL(env[key]);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error(`Invalid production origin: ${key}`);
  }
  if (new URL(env.BETTER_AUTH_URL).origin !== new URL(env.FRONTEND_URL).origin) throw new Error("Production requires one origin for client and API");
  const db = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(db.protocol)) throw new Error("Invalid database protocol");
  if (!["require", "verify-full"].includes(db.searchParams.get("sslmode"))) throw new Error("Production DATABASE_URL must require TLS");
}
