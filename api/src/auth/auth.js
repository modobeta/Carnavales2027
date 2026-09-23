import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { createEmailDelivery } from "../email/delivery.js";
import { createOtpSendLimiter } from "./identity-limiter.js";
import { getPool } from "../db/pool.js";
import { createOtpDelivery } from "./two-factor.js";

function requireEnvironment(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} no está definida.`);
  }

  return value;
}

function getTrustedOrigins() {
  return process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
}

export function createAuth({ sendOtp = createOtpDelivery() } = {}) {
  const limitOtpSend = createOtpSendLimiter();
  const deliverEmail = createEmailDelivery();
  return betterAuth({
    rateLimit: { customRules: {
      "/sign-in/email": { window: 60, max: 100 },
      "/two-factor/*": { window: 60, max: 100 },
    } },
    advanced: { ipAddress: { ipAddressHeaders: ["x-carnaval-client-ip"] } },
    database: getPool(),
    // Keep a juror session available throughout the event; active app sessions
    // are refreshed by the client and are explicitly ended when every assigned
    // event night has closed.
    session: { expiresIn: 60 * 60 * 24 * 365, updateAge: 10 * 60 },
    baseURL: requireEnvironment("BETTER_AUTH_URL"),
    secret: requireEnvironment("BETTER_AUTH_SECRET"),
    trustedOrigins: getTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const url = `${requireEnvironment("FRONTEND_URL")}/#/reset-password?token=${encodeURIComponent(token)}`;
        await deliverEmail({ to: user.email, subject: "Restablecé tu contraseña - Carnavales 2027",
          text: `Entrá a este enlace para definir una nueva contraseña: ${url}` });
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (_user, context) => {
            if (context?.path === "/sign-up/email") {
              throw new APIError("FORBIDDEN", {
                message: "El registro requiere una invitación administrativa.",
              });
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== "/two-factor/send-otp") return;
        const session = await getSessionFromCtx(context);
        let user = session?.user;
        if (!user) {
          const cookie = context.context.createAuthCookie("two_factor");
          const token = await context.getSignedCookie(cookie.name, context.context.secret);
          const verification = token ? await context.context.internalAdapter.findVerificationValue(token) : null;
          if (verification && new Date(verification.expiresAt).getTime() > Date.now()) {
            user = await context.context.internalAdapter.findUserById(verification.value);
          }
        }
        if (user) await limitOtpSend(async () => {}, { user });
      }),
      after: createAuthMiddleware(async (context) => {
        if (context.path === "/two-factor/send-otp" && context.context.pilotEmailFailed) {
          throw new APIError("SERVICE_UNAVAILABLE", { code: "EMAIL_DELIVERY_FAILED", message: "No se pudo enviar el código. Reintentá más tarde." });
        }
        if (context.path !== "/two-factor/verify-otp") return;

        const verifiedSession = context.context.newSession;
        if (!verifiedSession?.user?.twoFactorEnabled) return;

        const sessions = await context.context.internalAdapter.listSessions(
          verifiedSession.user.id,
        );
        const staleTokens = sessions
          .map((session) => session.token)
          .filter((token) => token !== verifiedSession.session.token);

        if (staleTokens.length > 0) {
          await context.context.internalAdapter.deleteSessions(staleTokens);
        }
      }),
    },
    plugins: [
      twoFactor({
        skipVerificationOnEnable: false,
        otpOptions: {
          digits: 6,
          period: 5,
          storeOTP: "encrypted",
          sendOTP: async (payload, context) => {
            try { await sendOtp(payload); }
            catch { context.context.pilotEmailFailed = true; }
          },
        },
      }),
    ],
  });
}

export const auth = createAuth();
