import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

const googleClient = new OAuth2Client(env.googleClientId || undefined);
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const hashOtp = (phoneNumber, code) =>
  createHmac("sha256", env.jwtSecret)
    .update(`${phoneNumber}:${code}`)
    .digest("hex");

const issueToken = (user) =>
  jwt.sign({}, env.jwtSecret, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: env.jwtExpiresIn,
  });

const userProfile = (user) => ({
  id: user.id,
  phone_number: user.phone_number,
  email: user.email,
  google_id: user.google_id,
  name: user.full_name,
  neighborhood: user.neighborhood,
  role: user.role,
  country_code: user.country_code,
  reputation_score: user.reputation_score,
  is_verified: user.is_verified,
});

const deliverOtp = async (phoneNumber, code) => {
  if (env.otpTestMode && env.nodeEnv !== "production") {
    return;
  }
  if (!env.smsDeliveryUrl || !env.smsDeliveryToken) {
    throw new Error("Le service SMS n'est pas configuré.");
  }
  const response = await fetch(env.smsDeliveryUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.smsDeliveryToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: phoneNumber,
      message: `Votre code de vérification QuartierPlus est ${code}. Il expire dans ${OTP_TTL_MINUTES} minutes.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Échec de livraison SMS (${response.status}).`);
  }
};

const detectCountryCode = async (client, phoneNumber) => {
  const result = await client.query(
    `SELECT code
     FROM country_config
     WHERE $1 LIKE phone_prefix || '%'
     ORDER BY length(phone_prefix) DESC
     LIMIT 1`,
    [phoneNumber],
  );
  return result.rows[0]?.code ?? null;
};

const googleVerificationFailure = (error) =>
  Object.assign(new Error("La vérification auprès de Google a échoué."), {
    status: error.response?.status === 400 ? 401 : 502,
  });

export const requestOtp = async (request, response, next) => {
  const phoneNumber =
    typeof request.body?.phone_number === "string"
      ? request.body.phone_number.trim()
      : "";
  if (!E164_PATTERN.test(phoneNumber)) {
    return response.status(400).json({
      error: "Le numéro de téléphone doit être au format international E.164.",
    });
  }

  if (
    !(env.otpTestMode && env.nodeEnv !== "production") &&
    (!env.smsDeliveryUrl || !env.smsDeliveryToken)
  ) {
    return response.status(503).json({ error: "Le service SMS est indisponible." });
  }

  const code = env.otpTestMode && env.nodeEnv !== "production"
    ? "123456"
    : String(randomInt(0, 1_000_000)).padStart(6, "0");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [phoneNumber],
    );
    const recentRequest = await client.query(
      `SELECT 1
       FROM otp_verifications
       WHERE phone_number = $1
         AND created_at > NOW() - INTERVAL '60 seconds'
       FOR UPDATE`,
      [phoneNumber],
    );
    if (recentRequest.rowCount > 0) {
      await client.query("ROLLBACK");
      return response.status(429).json({
        error: "Un code a déjà été demandé récemment. Réessayez dans une minute.",
      });
    }
    await client.query(
      `INSERT INTO otp_verifications
         (phone_number, code_hash, expires_at, attempts, created_at)
       VALUES ($1, $2, NOW() + INTERVAL '${OTP_TTL_MINUTES} minutes', 0, NOW())
       ON CONFLICT (phone_number) DO UPDATE SET
         code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         created_at = NOW()`,
      [phoneNumber, hashOtp(phoneNumber, code)],
    );
    await client.query("COMMIT");
    await deliverOtp(phoneNumber, code);
    return response.status(200).json({
      message: "Si le numéro est valide, un code de vérification a été envoyé.",
      ...(env.otpTestMode && env.nodeEnv !== "production"
        ? { test_code: "123456" }
        : {}),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await pool
      .query("DELETE FROM otp_verifications WHERE phone_number = $1", [
        phoneNumber,
      ])
      .catch((cleanupError) => {
        console.error("Failed to remove undelivered OTP:", cleanupError);
      });
    return next(error);
  } finally {
    client.release();
  }
};

export const requestPhoneChangeOtp = async (request, response, next) => {
  const phoneNumber =
    typeof request.body?.phone_number === "string"
      ? request.body.phone_number.trim()
      : "";
  if (!E164_PATTERN.test(phoneNumber)) {
    return response.status(400).json({
      error: "Le numéro de téléphone doit être au format international E.164.",
    });
  }
  if (
    !(env.otpTestMode && env.nodeEnv !== "production") &&
    (!env.smsDeliveryUrl || !env.smsDeliveryToken)
  ) {
    return response.status(503).json({ error: "Le service SMS est indisponible." });
  }

  const code =
    env.otpTestMode && env.nodeEnv !== "production"
      ? "123456"
      : String(randomInt(0, 1_000_000)).padStart(6, "0");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [phoneNumber],
    );
    const owner = await client.query(
      "SELECT id FROM users WHERE phone_number = $1 FOR UPDATE",
      [phoneNumber],
    );
    if (owner.rowCount > 0 && owner.rows[0].id !== request.auth.userId) {
      await client.query("ROLLBACK");
      return response.status(409).json({
        error: "Ce numéro est déjà associé à un autre compte.",
      });
    }
    const recentRequest = await client.query(
      `SELECT 1 FROM otp_verifications
       WHERE phone_number = $1
         AND created_at > NOW() - INTERVAL '60 seconds'
       FOR UPDATE`,
      [phoneNumber],
    );
    if (recentRequest.rowCount > 0) {
      await client.query("ROLLBACK");
      return response.status(429).json({
        error: "Un code a déjà été demandé récemment. Réessayez dans une minute.",
      });
    }
    await client.query(
      `INSERT INTO otp_verifications
         (phone_number, code_hash, expires_at, attempts, created_at)
       VALUES ($1, $2, NOW() + INTERVAL '${OTP_TTL_MINUTES} minutes', 0, NOW())
       ON CONFLICT (phone_number) DO UPDATE SET
         code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         created_at = NOW()`,
      [phoneNumber, hashOtp(phoneNumber, code)],
    );
    await client.query("COMMIT");
    await deliverOtp(phoneNumber, code);
    return response.status(200).json({
      message: "Un code de vérification a été envoyé.",
      ...(env.otpTestMode && env.nodeEnv !== "production"
        ? { test_code: "123456" }
        : {}),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await pool
      .query("DELETE FROM otp_verifications WHERE phone_number = $1", [
        phoneNumber,
      ])
      .catch((cleanupError) => {
        console.error("Failed to remove undelivered phone-change OTP:", cleanupError);
      });
    return next(error);
  } finally {
    client.release();
  }
};

export const verifyPhoneChangeOtp = async (request, response, next) => {
  const phoneNumber =
    typeof request.body?.phone_number === "string"
      ? request.body.phone_number.trim()
      : "";
  const code = typeof request.body?.code === "string" ? request.body.code : "";
  if (!E164_PATTERN.test(phoneNumber) || !/^\d{6}$/.test(code)) {
    return response.status(400).json({ error: "Numéro ou code invalide." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const verification = await client.query(
      `SELECT code_hash, attempts
       FROM otp_verifications
       WHERE phone_number = $1 AND expires_at > NOW()
       FOR UPDATE`,
      [phoneNumber],
    );
    const entry = verification.rows[0];
    if (!entry || entry.attempts >= OTP_MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      return response.status(401).json({ error: "Code invalide ou expiré." });
    }
    const expectedHash = Buffer.from(entry.code_hash, "hex");
    const actualHash = Buffer.from(hashOtp(phoneNumber, code), "hex");
    if (
      expectedHash.length !== actualHash.length ||
      !timingSafeEqual(expectedHash, actualHash)
    ) {
      await client.query(
        `UPDATE otp_verifications
         SET attempts = attempts + 1
         WHERE phone_number = $1`,
        [phoneNumber],
      );
      await client.query("COMMIT");
      return response.status(401).json({ error: "Code invalide ou expiré." });
    }

    const owner = await client.query(
      "SELECT id FROM users WHERE phone_number = $1 FOR UPDATE",
      [phoneNumber],
    );
    if (owner.rowCount > 0 && owner.rows[0].id !== request.auth.userId) {
      await client.query("ROLLBACK");
      return response.status(409).json({
        error: "Ce numéro est déjà associé à un autre compte.",
      });
    }
    const updated = await client.query(
      `UPDATE users SET phone_number = $1, is_verified = TRUE
       WHERE id = $2
       RETURNING id, phone_number`,
      [phoneNumber, request.auth.userId],
    );
    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Utilisateur introuvable." });
    }
    await client.query(
      "DELETE FROM otp_verifications WHERE phone_number = $1",
      [phoneNumber],
    );
    await client.query("COMMIT");
    return response.status(200).json({
      phone_number: updated.rows[0].phone_number,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      return response.status(409).json({
        error: "Ce numéro est déjà associé à un autre compte.",
      });
    }
    return next(error);
  } finally {
    client.release();
  }
};

export const verifyOtp = async (request, response, next) => {
  const phoneNumber =
    typeof request.body?.phone_number === "string"
      ? request.body.phone_number.trim()
      : "";
  const code = typeof request.body?.code === "string" ? request.body.code : "";
  if (!E164_PATTERN.test(phoneNumber) || !/^\d{6}$/.test(code)) {
    return response.status(400).json({ error: "Numéro ou code invalide." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const verification = await client.query(
      `SELECT code_hash, attempts
       FROM otp_verifications
       WHERE phone_number = $1 AND expires_at > NOW()
       FOR UPDATE`,
      [phoneNumber],
    );
    const entry = verification.rows[0];
    if (!entry || entry.attempts >= OTP_MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      return response.status(401).json({ error: "Code invalide ou expiré." });
    }

    const candidateHash = hashOtp(phoneNumber, code);
    const expectedHash = Buffer.from(entry.code_hash, "hex");
    const actualHash = Buffer.from(candidateHash, "hex");
    if (
      expectedHash.length !== actualHash.length ||
      !timingSafeEqual(expectedHash, actualHash)
    ) {
      await client.query(
        `UPDATE otp_verifications
         SET attempts = attempts + 1
         WHERE phone_number = $1`,
        [phoneNumber],
      );
      await client.query("COMMIT");
      return response.status(401).json({ error: "Code invalide ou expiré." });
    }

    await client.query(
      "DELETE FROM otp_verifications WHERE phone_number = $1",
      [phoneNumber],
    );
    const countryCode = await detectCountryCode(client, phoneNumber);
    const result = await client.query(
      `INSERT INTO users (phone_number, country_code, is_verified)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (phone_number) DO UPDATE SET
         country_code = COALESCE(EXCLUDED.country_code, users.country_code),
         is_verified = TRUE
       RETURNING id, phone_number, email, google_id, full_name, role,
                 neighborhood, country_code, reputation_score, is_verified`,
      [phoneNumber, countryCode],
    );
    await client.query("COMMIT");
    const user = result.rows[0];
    return response.status(200).json({
      token: issueToken(user),
      user: userProfile(user),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
};

const verifyGoogleCredential = async (credential, tokenType) => {
  if (env.googleClientIds.length === 0) {
    throw Object.assign(new Error("La connexion Google n'est pas configurée."), {
      status: 503,
    });
  }
  if (tokenType !== "access_token" && credential.split(".").length === 3) {
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.googleClientIds,
      });
    } catch (error) {
      throw googleVerificationFailure(error);
    }
    const payload = ticket.getPayload();
    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true
    ) {
      throw Object.assign(new Error("Jeton Google invalide."), { status: 401 });
    }
    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name ?? null,
    };
  }

  let tokenInfo;
  try {
    tokenInfo = await googleClient.getTokenInfo(credential);
  } catch (error) {
    throw googleVerificationFailure(error);
  }
  if (!env.googleClientIds.includes(tokenInfo.aud)) {
    throw Object.assign(new Error("Jeton Google invalide."), { status: 401 });
  }
  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${credential}` } },
  );
  if (!userInfoResponse.ok) {
    throw Object.assign(new Error("Jeton Google invalide."), { status: 401 });
  }
  const userInfo = await userInfoResponse.json();
  if (
    typeof userInfo.sub !== "string" ||
    typeof userInfo.email !== "string" ||
    userInfo.email_verified !== true
  ) {
    throw Object.assign(new Error("Jeton Google invalide."), { status: 401 });
  }
  return {
    googleId: userInfo.sub,
    email: userInfo.email.toLowerCase(),
    name: typeof userInfo.name === "string" ? userInfo.name : null,
  };
};

export const googleAuth = async (request, response, next) => {
  const credential =
    typeof request.body?.credential === "string"
      ? request.body.credential
      : typeof request.body?.id_token === "string"
        ? request.body.id_token
        : typeof request.body?.access_token === "string"
          ? request.body.access_token
          : "";
  const credentialType =
    typeof request.body?.id_token === "string"
      ? "id_token"
      : typeof request.body?.access_token === "string"
        ? "access_token"
        : undefined;
  if (!credential || credential.length > 8192) {
    return response.status(400).json({ error: "Jeton Google manquant ou invalide." });
  }

  try {
    const identity = await verifyGoogleCredential(credential, credentialType);
    const client = await pool.connect();
    let user;
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT id, google_id
         FROM users
         WHERE google_id = $1 OR email = $2
         FOR UPDATE`,
        [identity.googleId, identity.email],
      );
      if (existing.rows.length > 1) {
        throw Object.assign(
          new Error("Les identifiants Google correspondent à plusieurs comptes."),
          { status: 409 },
        );
      }
      const result =
        existing.rows.length === 1
          ? await client.query(
              `UPDATE users
               SET google_id = $1,
                   email = $2,
                   full_name = COALESCE($3, full_name),
                   is_verified = TRUE
               WHERE id = $4
               RETURNING id, phone_number, email, google_id, full_name, role,
                         neighborhood, country_code, reputation_score, is_verified`,
              [
                identity.googleId,
                identity.email,
                identity.name,
                existing.rows[0].id,
              ],
            )
          : await client.query(
              `INSERT INTO users (google_id, email, full_name, is_verified)
               VALUES ($1, $2, $3, TRUE)
               RETURNING id, phone_number, email, google_id, full_name, role,
                         neighborhood, country_code, reputation_score, is_verified`,
              [identity.googleId, identity.email, identity.name],
            );
      user = result.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return response.status(200).json({
      token: issueToken(user),
      user: userProfile(user),
    });
  } catch (error) {
    if (error.code === "23505") {
      return response.status(409).json({
        error: "Cette adresse e-mail est déjà associée à un autre compte.",
      });
    }
    return next(error);
  }
};
