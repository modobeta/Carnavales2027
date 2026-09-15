import MailComposer from "nodemailer/lib/mail-composer/index.js";

export function createGmailDelivery({ env, fetchImpl }) {
  let cachedToken;
  let expiresAt = 0;
  let refreshing;

  async function accessToken() {
    if (cachedToken && Date.now() < expiresAt) return cachedToken;
    if (!refreshing) {
      refreshing = (async () => {
        const response = await fetchImpl("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.GMAIL_CLIENT_ID,
            client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN }),
        });
        if (!response.ok) throw new Error("OAuth refresh failed");
        const token = await response.json();
        if (typeof token.access_token !== "string" || !token.access_token || !(Number(token.expires_in) > 0)) {
          throw new Error("Invalid OAuth response");
        }
        cachedToken = token.access_token;
        expiresAt = Date.now() + Math.max(0, Number(token.expires_in) - 60) * 1000;
        return cachedToken;
      })().finally(() => { refreshing = undefined; });
    }
    return refreshing;
  }

  return async (message) => {
    const token = await accessToken();
    const mime = await new MailComposer({
      from: env.EMAIL_FROM, to: message.to, subject: message.subject,
      text: message.text, html: message.html,
      disableFileAccess: true, disableUrlAccess: true,
    }).compile().build();
    const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: mime.toString("base64url") }),
    });
    if (response.status === 401) { cachedToken = undefined; expiresAt = 0; }
    // Do not automatically retry: an ambiguous timeout may already have sent the OTP.
    if (!response.ok) throw new Error("Gmail rejected delivery");
    const result = await response.json();
    if (typeof result.id !== "string" || !result.id) throw new Error("Invalid Gmail response");
  };
}
