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
const otpTestAllowlist = [
  ...new Set(
    optional("OTP_TEST_ALLOWLIST")
      .split(",")
      .map((phoneNumber) => phoneNumber.trim())
      .filter(Boolean),
  ),
];
if (otpTestAllowlist.some((phoneNumber) => !/^\+[1-9]\d{7,14}$/.test(phoneNumber))) {
  throw new Error("OTP_TEST_ALLOWLIST must contain comma-separated E.164 phone numbers.");
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

const cloudinaryCloudName = optional("CLOUDINARY_CLOUD_NAME");
const cloudinaryApiKey = optional("CLOUDINARY_API_KEY");
const cloudinaryApiSecret = optional("CLOUDINARY_API_SECRET");
const cloudinarySettings = [
  ["CLOUDINARY_CLOUD_NAME", cloudinaryCloudName],
  ["CLOUDINARY_API_KEY", cloudinaryApiKey],
  ["CLOUDINARY_API_SECRET", cloudinaryApiSecret],
];
if (
  cloudinarySettings.some(([, value]) => Boolean(value)) &&
  cloudinarySettings.some(([, value]) => !value)
) {
  const missingVariables = cloudinarySettings
    .filter(([, value]) => !value)
    .map(([name]) => name);
  throw new Error(
    `Cloudinary configuration is incomplete. Missing variable(s): ${missingVariables.join(", ")}.`,
  );
}

const positiveInteger = (name, fallback) => {
  const value = optional(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
};

const googleClientId = optional("GOOGLE_CLIENT_ID");
const livekitApiKey = optional("LIVEKIT_API_KEY");
const livekitApiSecret = optional("LIVEKIT_API_SECRET");
const livekitUrl = optional("LIVEKIT_URL");
const isPlaceholderLiveKitValue = (value) =>
  /(?:your[-_]|replace[-_]?with|fake|placeholder|changeme|example(?:\.|$))/i.test(
    value,
  );
const livekitConfigurationProblems = [
  !/^AP_[A-Za-z0-9_-]{8,}$/.test(livekitApiKey) ||
  isPlaceholderLiveKitValue(livekitApiKey)
    ? "LIVEKIT_API_KEY"
    : null,
  livekitApiSecret.length < 32 || isPlaceholderLiveKitValue(livekitApiSecret)
    ? "LIVEKIT_API_SECRET"
    : null,
  !livekitUrl || isPlaceholderLiveKitValue(livekitUrl)
    ? "LIVEKIT_URL"
    : null,
].filter((name) => name !== null);
const livekitConfigurationIsUsable = livekitConfigurationProblems.length === 0;
if (isProduction) {
  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is required in production.");
  }
  if (!livekitConfigurationIsUsable) {
    throw new Error(
      `Invalid or missing LiveKit configuration in production: ${livekitConfigurationProblems.join(", ")}.`,
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
  otpTestAllowlist,
  smsDeliveryUrl,
  smsDeliveryToken,
  emailProvider: optional("EMAIL_PROVIDER").toLowerCase(),
  emailApiKey: optional("EMAIL_API_KEY"),
  emailFrom: optional("EMAIL_FROM"),
  livekitApiKey,
  livekitApiSecret,
  livekitUrl,
  livekitConfigurationIsUsable,
  livekitConfigurationProblems,
  fedapaySecretKey: optional("FEDAPAY_SECRET_KEY"),
  fedapayPublicKey: optional("FEDAPAY_PUBLIC_KEY"),
  fedapayEnvironment,
  fedapayWebhookSecret: optional("FEDAPAY_WEBHOOK_SECRET"),
  ticketQrSecret: ticketQrSecret || jwtSecret,
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  postMaxPhotoBytes: positiveInteger("POST_MAX_PHOTO_BYTES", 10 * 1024 * 1024),
  postMaxVideoSeconds: positiveInteger("POST_MAX_VIDEO_SECONDS", 30),
  postMaxVideoBytes: positiveInteger("POST_MAX_VIDEO_BYTES", 30 * 1024 * 1024),
  postDailyLimit: positiveInteger("POST_DAILY_LIMIT", 10),
  isPromoFreeAccess: promoFreeAccessValue === "true",
  pgSsl: pgSslValue === "true",
  socketCorsOrigins: optional("SOCKET_CORS_ORIGIN")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});
