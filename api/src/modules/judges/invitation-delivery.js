import { createEmailDelivery } from "../../email/delivery.js";

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} no está definida.`);
  return value;
}

function invitationUrl(secret, route = "#/invitations/accept") {
  const frontendUrl = requireEnvironment("FRONTEND_URL").replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" && !frontendUrl.startsWith("https://")) {
    throw new Error("FRONTEND_URL debe usar HTTPS en producción.");
  }
  return `${frontendUrl}/${route}?secret=${encodeURIComponent(secret)}`;
}

export function createInvitationDelivery({ route, ...options } = {}) {
  const deliver = createEmailDelivery(options);
  return async ({ email, name, secret, expiresAt }) => {
    const url = invitationUrl(secret, route);
    await deliver({ to: email, subject: "Invitación al padrón de jurados",
      text: `Hola ${name}. Completá tu registro antes de ${expiresAt.toISOString()}: ${url}`,
    });
  };
}
