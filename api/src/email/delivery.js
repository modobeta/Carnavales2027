import nodemailer from "nodemailer";
import { createGmailDelivery } from "./gmail.js";

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing email configuration: ${key}`);
  return value;
}

export function validateEmailConfig(env = process.env) {
  const provider = env.EMAIL_PROVIDER ?? "console";
  if (provider === "console" && env.NODE_ENV !== "production") return provider;
  if (!["smtp", "gmail"].includes(provider)) {
    throw new Error("EMAIL_PROVIDER=smtp o gmail es obligatorio en producción.");
  }
  required(env, "EMAIL_FROM");
  if (provider === "gmail") {
    for (const key of ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]) required(env, key);
  }
  else {
    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) required(env, key);
    const port = Number(env.SMTP_PORT ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP_PORT");
    if (env.SMTP_SECURE !== undefined && !["true", "false"].includes(env.SMTP_SECURE)) throw new Error("Invalid SMTP_SECURE");
  }
  return provider;
}

export function createEmailDelivery({ createTransport = nodemailer.createTransport, fetchImpl = globalThis.fetch, logger = console, env = process.env } = {}) {
  const deliverGmail = createGmailDelivery({ env, fetchImpl });
  return async (message) => {
    const provider = validateEmailConfig(env);
    if (provider === "console") {
      logger.info(`[DEV EMAIL] ${message.to}: ${message.text}`);
      return;
    }
    try {
      if (provider === "smtp") {
        const transport = createTransport({
          host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 587),
          secure: env.SMTP_SECURE === "true", requireTLS: env.SMTP_SECURE !== "true",
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
          connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
        });
        try { await transport.sendMail({ ...message, from: env.EMAIL_FROM }); }
        finally { transport.close?.(); }
        return;
      }
      await deliverGmail(message);
    } catch {
      // Never include provider responses, recipient, credentials, OTP or reset URLs in logs.
      throw new Error("EMAIL_DELIVERY_FAILED");
    }
  };
}
