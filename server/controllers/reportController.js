import { pool } from "../db/pool.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET_TYPES = new Map([
  ["post", "POST"],
  ["message", "MESSAGE"],
  ["marketplace_item", "MARKETPLACE_ITEM"],
]);

export const createReport = async (request, response, next) => {
  const targetType =
    typeof request.body?.target_type === "string"
      ? TARGET_TYPES.get(request.body.target_type.toLowerCase())
      : undefined;
  const targetId =
    typeof request.body?.target_id === "string"
      ? request.body.target_id
      : "";
  const reason =
    typeof request.body?.reason === "string"
      ? request.body.reason.trim().slice(0, 500)
      : "";
  if (!targetType || !UUID_PATTERN.test(targetId) || !reason) {
    return response.status(400).json({ error: "Les informations du signalement sont invalides." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [request.auth.userId, targetType, targetId, reason],
    );
    return response.status(201).json({
      reported: true,
      report_id: result.rows[0].id,
    });
  } catch (error) {
    return next(error);
  }
};
