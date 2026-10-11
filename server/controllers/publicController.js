import { pool } from "../db/pool.js";

const nearbyFilter = (query) => {
  const { latitude, longitude, radius_m: radius } = query;
  if (latitude === undefined && longitude === undefined && radius === undefined) {
    return { values: [null, null, null] };
  }

  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  const parsedRadius = Number(radius ?? 30_000);
  if (
    !Number.isFinite(parsedLatitude) ||
    parsedLatitude < -90 ||
    parsedLatitude > 90 ||
    !Number.isFinite(parsedLongitude) ||
    parsedLongitude < -180 ||
    parsedLongitude > 180 ||
    !Number.isFinite(parsedRadius) ||
    parsedRadius < 1 ||
    parsedRadius > 100_000
  ) {
    return null;
  }
  return { values: [parsedLatitude, parsedLongitude, parsedRadius] };
};

export const listPublicMarketplace = async (_request, response, next) => {
  const filter = nearbyFilter(_request.query);
  if (!filter) {
    return response.status(400).json({
      error: "La position et le rayon de recherche sont invalides.",
    });
  }
  try {
    const result = await pool.query(
      `SELECT item.id, item.title, item.description, item.category,
              item.price_fcfa AS price, item.price_fcfa = 0 AS is_free,
              item.created_at, user_profile.neighborhood,
              item.image_urls[1] AS image_url
       FROM marketplace_items AS item
       LEFT JOIN users AS user_profile ON user_profile.id = item.seller_id
       WHERE $1::double precision IS NULL OR ST_DWithin(
         item.location::geography,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
         $3
       )
       ORDER BY item.created_at DESC
       LIMIT 100`,
      filter.values,
    );
    return response.status(200).json({ items: result.rows });
  } catch (error) {
    return next(error);
  }
};

export const listNearbyAlerts = async (request, response, next) => {
  const filter = nearbyFilter(request.query);
  if (!filter) {
    return response.status(400).json({
      error: "La position et le rayon de recherche sont invalides.",
    });
  }
  try {
    const result = await pool.query(
      `SELECT id, emergency_type, created_at,
              ST_Y(location) AS latitude, ST_X(location) AS longitude
       FROM sos_alerts
       WHERE status = 'ACTIVE'
         AND ($1::double precision IS NULL OR ST_DWithin(
           location::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         ))
       ORDER BY created_at DESC
       LIMIT 100`,
      filter.values,
    );
    return response.status(200).json({ alerts: result.rows });
  } catch (error) {
    return next(error);
  }
};
