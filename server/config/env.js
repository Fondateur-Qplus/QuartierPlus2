import "dotenv/config";

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error("NODE_ENV must be development, test, or production.");
}
const isProduction = nodeEnv === "production";

const optional = (name) => process.env[name]?.trim() ?? "";

const required = (name) => {
  const value = optional(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const pgSslValue = optional("PGSSL");
if (pgSslValue && !["true", "false"].includes(pgSslValue)) {
  throw new Error("PGSSL must be true or false.");
}
const promoFreeAccessValue = optional("IS_PROMO_FREE_ACCESS");
if (promoFreeAccessValue && !["true", "false"].includes(promoFreeAccessValue)) {
  throw new Error("IS_PROMO_FREE_ACCESS must be true or false.");
}

const databaseUrl = required("DATABASE_URL");
let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
}
if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
  throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
}

const otpTestModeValue = optional("OTP_TEST_MODE");
if (otpTestModeValue && !["true", "false"].includes(otpTestModeValue)) {
  throw new Error("OTP_TEST_MODE must be true or false.");
}
const otpTestMode = otpTestModeValue === "true";
if (isProduction && otpTestMode) {
  throw new Error("OTP_TEST_MODE must not be enabled in production.");
}

const smsDeliveryUrl = optional("SMS_DELIVERY_URL");
const smsDeliveryToken = optional("SMS_DELIVERY_TOKEN");
if (isProduction && (!smsDeliveryUrl || !smsDeliveryToken)) {
  throw new Error("SMS_DELIVERY_URL and SMS_DELIVERY_TOKEN are required in production.");
}
if (smsDeliveryUrl) {
  let smsUrl;
  try {
    smsUrl = new URL(smsDeliveryUrl);
  } catch {
    throw new Error("SMS_DELIVERY_URL must be a valid URL.");
  }
  if (isProduction && smsUrl.protocol !== "https:") {
    throw new Error("SMS_DELIVERY_URL must use HTTPS in production.");
  }
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters.");
}

const ticketQrSecret = optional("TICKET_QR_SECRET");
if (isProduction && ticketQrSecret.length < 32) {
  throw new Error(
    "TICKET_QR_SECRET must contain at least 32 characters in production.",
  );
}

const googleClientId = optional("GOOGLE_CLIENT_ID");
const livekitApiKey = optional("LIVEKIT_API_KEY");
const livekitApiSecret = optional("LIVEKIT_API_SECRET");
const livekitUrl = optional("LIVEKIT_URL");
if (isProduction) {
  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is required in production.");
  }
  if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
    throw new Error(
      "LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL are required in production.",
    );
  }
}
if (livekitUrl) {
  let parsedLivekitUrl;
  try {
    parsedLivekitUrl = new URL(livekitUrl);
  } catch {
    throw new Error("LIVEKIT_URL must be a valid WebSocket URL.");
  }
  if (
    !["wss:", "ws:"].includes(parsedLivekitUrl.protocol) ||
    !parsedLivekitUrl.hostname ||
    (isProduction && parsedLivekitUrl.protocol !== "wss:")
  ) {
    throw new Error("LIVEKIT_URL must use WSS in production.");
  }
}

const fedapayEnvironment = optional("FEDAPAY_ENVIRONMENT") || "sandbox";
if (!["sandbox", "live"].includes(fedapayEnvironment)) {
  throw new Error("FEDAPAY_ENVIRONMENT must be sandbox or live.");
}

export const env = Object.freeze({
  nodeEnv,
  port,
  databaseUrl,
  jwtSecret,
  jwtExpiresIn: optional("JWT_EXPIRES_IN") || "7d",
  googleClientId,
  googleClientIds: [
    googleClientId,
    ...optional("GOOGLE_CLIENT_IDS")
      .split(",")
      .map((clientId) => clientId.trim()),
  ].filter((clientId, index, all) => clientId && all.indexOf(clientId) === index),
  otpTestMode,
  smsDeliveryUrl,
  smsDeliveryToken,
  livekitApiKey,
  livekitApiSecret,
  livekitUrl,
  fedapaySecretKey: optional("FEDAPAY_SECRET_KEY"),
  fedapayPublicKey: optional("FEDAPAY_PUBLIC_KEY"),
  fedapayEnvironment,
  fedapayWebhookSecret: optional("FEDAPAY_WEBHOOK_SECRET"),
  ticketQrSecret: ticketQrSecret || jwtSecret,
  isPromoFreeAccess: promoFreeAccessValue === "true",
  pgSsl: pgSslValue === "true",
  socketCorsOrigins: optional("SOCKET_CORS_ORIGIN")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});
