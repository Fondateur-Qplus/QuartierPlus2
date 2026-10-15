import { pool } from "../db/pool.js";

const CATEGORIES = new Set([
  "POWER_OUTAGE",
  "WATER_OUTAGE",
  "ROAD_HAZARD",
  "LOST_ITEM",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseCoordinates = (value) => {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { latitude, longitude };
};

const markerShape = (row) => ({
  id: row.id,
  category: row.category,
  title: row.title,
  description: row.description,
  coordinates: { latitude: row.latitude, longitude: row.longitude },
  radius_impact_m: row.radius_impact_m,
  confirmations_count: row.confirmations_count,
  status: row.status,
  is_sponsored: false,
  expires_at: row.expires_at,
});

export const listMapMarkers = async (request, response, next) => {
  const radius = Number(request.query.radius_m ?? 30_000);
  const hasCoordinates =
    request.query.latitude !== undefined || request.query.longitude !== undefined;
  const coordinates = hasCoordinates
    ? parseCoordinates({
        latitude: request.query.latitude,
        longitude: request.query.longitude,
      })
    : null;
  if (
    !Number.isFinite(radius) ||
    radius < 1 ||
    radius > 100_000 ||
    (hasCoordinates && !coordinates)
  ) {
    return response.status(400).json({ error: "La position ou le rayon est invalide." });
  }
  try {
    const result = await pool.query(
      `SELECT marker.id, marker.category, marker.title, marker.description,
              marker.radius_impact_m, marker.status, marker.expires_at,
              ST_Y(marker.location) AS latitude,
              ST_X(marker.location) AS longitude,
              (SELECT COUNT(*)::int FROM map_marker_confirmations AS confirmation
               WHERE confirmation.marker_id = marker.id) AS confirmations_count
       FROM map_markers AS marker
       WHERE marker.status IN ('CONFIRMING', 'ACTIVE')
         AND marker.expires_at > CURRENT_TIMESTAMP
         AND ($1::double precision IS NULL OR ST_DWithin(
           marker.location::geography,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
           $4
         ))
       ORDER BY marker.created_at DESC
       LIMIT 500`,
      [
        coordinates?.latitude ?? null,
        coordinates?.longitude ?? null,
        coordinates?.latitude ?? null,
        radius,
      ],
    );
    return response.status(200).json({ markers: result.rows.map(markerShape) });
  } catch (error) {
    return next(error);
  }
};

export const createMapMarker = async (request, response, next) => {
  const category =
    typeof request.body?.category === "string"
      ? request.body.category.toUpperCase()
      : "";
  const coordinates = parseCoordinates(request.body?.location);
  const title =
    typeof request.body?.title === "string"
      ? request.body.title.trim().slice(0, 150)
      : "";
  const radius = Number(request.body?.radius_impact_m ?? 500);
  if (
    !CATEGORIES.has(category) ||
    !coordinates ||
    !title ||
    !Number.isInteger(radius) ||
    radius < 1 ||
    radius > 10_000
  ) {
    return response.status(400).json({ error: "Le signalement de carte est invalide." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO map_markers
         (user_id, category, title, location, radius_impact_m)
       VALUES (
         $1, $2, $3,
         ST_SetSRID(ST_MakePoint($5, $4), 4326),
         $6
       )
       RETURNING id, category, title, description, radius_impact_m, status,
                 expires_at, ST_Y(location) AS latitude,
                 ST_X(location) AS longitude`,
      [
        request.auth.userId,
        category,
        title,
        coordinates.latitude,
        coordinates.longitude,
        radius,
      ],
    );
    return response.status(201).json(
      markerShape({ ...result.rows[0], confirmations_count: 0 }),
    );
  } catch (error) {
    return next(error);
  }
};

export const confirmMapMarker = async (request, response, next) => {
  if (!UUID_PATTERN.test(request.params.id)) {
    return response.status(400).json({ error: "Identifiant de marqueur invalide." });
  }
  const coordinates = parseCoordinates(request.body);
  if (!coordinates) {
    return response.status(400).json({ error: "La position de confirmation est invalide." });
  }
  try {
    const confirmation = await pool.query(
      `INSERT INTO map_marker_confirmations (marker_id, user_id, location)
       SELECT marker.id, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)
       FROM map_markers AS marker
       WHERE marker.id = $1
         AND marker.status IN ('CONFIRMING', 'ACTIVE')
         AND marker.expires_at > CURRENT_TIMESTAMP
         AND ST_DWithin(
           marker.location::geography,
           ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
           500
         )
       ON CONFLICT (marker_id, user_id) DO UPDATE
         SET location = EXCLUDED.location,
             created_at = CURRENT_TIMESTAMP
       RETURNING marker_id`,
      [request.params.id, request.auth.userId, coordinates.latitude, coordinates.longitude],
    );
    if (!confirmation.rowCount) {
      return response.status(404).json({ error: "Marqueur introuvable à proximité." });
    }
    const updated = await pool.query(
      `UPDATE map_markers AS marker
       SET status = CASE
         WHEN (SELECT COUNT(*) FROM map_marker_confirmations AS confirmation
               WHERE confirmation.marker_id = marker.id) >= 3 THEN 'ACTIVE'
         ELSE 'CONFIRMING'
       END
       WHERE marker.id = $1
       RETURNING marker.id, marker.category, marker.title, marker.description,
                 marker.radius_impact_m, marker.status, marker.expires_at,
                 ST_Y(marker.location) AS latitude,
                 ST_X(marker.location) AS longitude,
                 (SELECT COUNT(*)::int FROM map_marker_confirmations AS confirmation
                  WHERE confirmation.marker_id = marker.id) AS confirmations_count`,
      [request.params.id],
    );
    return response.status(200).json(markerShape(updated.rows[0]));
  } catch (error) {
    return next(error);
  }
};
