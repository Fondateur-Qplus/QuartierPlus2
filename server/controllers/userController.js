import { pool } from "../db/pool.js";

const profileQuery = `
  SELECT id, phone_number, email, google_id, full_name, neighborhood, role,
         country_code, reputation_score, is_verified, badge
  FROM users
  WHERE id = $1
`;

const formatProfile = (user) => ({
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
  badge: user.badge,
});

export const getCurrentUser = async (request, response, next) => {
  try {
    const result = await pool.query(profileQuery, [request.auth.userId]);
    if (result.rowCount === 0) {
      return response.status(404).json({ error: "Utilisateur introuvable." });
    }
    return response.status(200).json({ user: formatProfile(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
};

export const updateCurrentUser = async (request, response, next) => {
  const name =
    typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const neighborhood =
    typeof request.body?.neighborhood === "string"
      ? request.body.neighborhood.trim()
      : "";
  const countryCode =
    typeof request.body?.country_code === "string"
      ? request.body.country_code.trim().toUpperCase()
      : "";
  if (!name || name.length > 100 || neighborhood.length > 100) {
    return response.status(400).json({
      error: "Le nom (1 à 100 caractères) et le quartier (100 caractères max) sont requis.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = $1,
           neighborhood = $2,
           country_code = COALESCE(NULLIF($3, ''), country_code)
       WHERE id = $4
       RETURNING id, phone_number, email, google_id, full_name, neighborhood,
                 role, country_code, reputation_score, is_verified, badge`,
      [name, neighborhood || null, countryCode, request.auth.userId],
    );
    if (result.rowCount === 0) {
      return response.status(404).json({ error: "Utilisateur introuvable." });
    }
    return response.status(200).json({ user: formatProfile(result.rows[0]) });
  } catch (error) {
    if (error.code === "23503") {
      return response.status(400).json({ error: "Code pays inconnu." });
    }
    return next(error);
  }
};
