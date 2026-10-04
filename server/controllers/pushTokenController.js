import { pool } from "../db/pool.js";

const EXPO_PUSH_TOKEN_PATTERN = /^ExpoPushToken\[[A-Za-z0-9-]{1,200}\]$/;

export const isValidExpoPushToken = (token) =>
  typeof token === "string" && EXPO_PUSH_TOKEN_PATTERN.test(token);

export const registerPushToken = async (request, response, next) => {
  const token =
    typeof request.body?.token === "string" ? request.body.token.trim() : "";
  const platform =
    typeof request.body?.platform === "string"
      ? request.body.platform.trim().toLowerCase()
      : "";
  if (!isValidExpoPushToken(token) || !["ios", "android"].includes(platform)) {
    return response.status(400).json({
      error: "Jeton Expo ou plateforme mobile invalide.",
    });
  }

  try {
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         platform = EXCLUDED.platform,
         updated_at = CURRENT_TIMESTAMP`,
      [request.auth.userId, token, platform],
    );
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
};

export const removePushToken = async (request, response, next) => {
  const token =
    typeof request.body?.token === "string" ? request.body.token.trim() : "";
  if (!isValidExpoPushToken(token)) {
    return response.status(400).json({ error: "Jeton Expo invalide." });
  }
  try {
    await pool.query(
      "DELETE FROM push_tokens WHERE user_id = $1 AND token = $2",
      [request.auth.userId, token],
    );
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
};
