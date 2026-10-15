import { pool } from "../db/pool.js";

const EMERGENCY_TYPES = new Set(["MEDICAL", "SECURITY", "FIRE", "OTHER"]);

export const createSosAlert = async (request, response, next) => {
  const latitude = Number(request.body?.latitude);
  const longitude = Number(request.body?.longitude);
  const emergencyType =
    typeof request.body?.emergency_type === "string"
      ? request.body.emergency_type.toUpperCase()
      : "OTHER";
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !EMERGENCY_TYPES.has(emergencyType)
  ) {
    return response.status(400).json({ error: "Les coordonnées SOS sont invalides." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO sos_alerts (user_id, location, emergency_type)
       VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326), $4)
       RETURNING id, emergency_type, status, escalation_level,
                 created_at, ST_Y(location) AS latitude,
                 ST_X(location) AS longitude`,
      [request.auth.userId, latitude, longitude, emergencyType],
    );
    const alert = result.rows[0];
    return response.status(201).json({
      alert: {
        ...alert,
        coordinates: { latitude: alert.latitude, longitude: alert.longitude },
        escalation_radius_km: 3,
      },
    });
  } catch (error) {
    return next(error);
  }
};
