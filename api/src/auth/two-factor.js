import { createEmailDelivery } from "../email/delivery.js";
import { otpEmail } from "../email-templates.js";

export function requireTwoFactor(request, response, next) {
  if (request.user?.twoFactorEnabled !== true) {
    return response.status(403).json({ code: "TWO_FACTOR_REQUIRED" });
  }

  return next();
}

export function createOtpDelivery(options = {}) {
  const deliver = createEmailDelivery(options);
  return async ({ user, otp }) => deliver({
    to: user.email, subject: "Código de verificación - Carnavales 2027",
    text: `Tu código de verificación es: ${otp}`,
    html: otpEmail({ otp }),
  });
}
