import { pool } from "../db/pool.js";

const nearbyFilter = (query) => {
  const { latitude, longitude, radius_m: radius, scope } = query;
  const countryCode =
    typeof query.country_code === "string"
      ? query.country_code.trim().toUpperCase()
      : null;
  if (
    scope !== undefined &&
    !["neighborhood", "region", "country", "international"].includes(scope)
  ) {
    return null;
  }
  if (scope === "country" && !/^[A-Z]{2,3}$/.test(countryCode ?? "")) {
    return null;
  }
  if (
    (scope === "neighborhood" || scope === "region") &&
    countryCode !== null &&
    !/^[A-Z]{2,3}$/.test(countryCode)
  ) {
    return null;
  }
  if (scope === "neighborhood" && !countryCode) return null;
  if (scope === "country" || scope === "international") {
    return { values: [null, null, null, countryCode, scope] };
  }
  if (latitude === undefined && longitude === undefined && radius === undefined) {
    if (scope === "neighborhood" || scope === "region") return null;
    return { values: [null, null, null, countryCode, scope ?? null] };
  }

  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  const parsedRadius =
    scope === "region" ? 100_000 : Number(radius ?? 30_000);
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
  return {
    values: [
      parsedLatitude,
      parsedLongitude,
      scope === "neighborhood" ? null : parsedRadius,
      countryCode,
      scope ?? null,
    ],
  };
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
       WHERE CASE
         WHEN $5 = 'international' THEN TRUE
         WHEN $5 = 'country' THEN user_profile.country_code = $4
         WHEN $5 = 'neighborhood' THEN ST_DWithin(
           item.location::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           COALESCE(
             (SELECT default_radius_m FROM country_config WHERE code = $4),
             5000
           )
         )
         WHEN $5 = 'region' THEN ST_DWithin(
           item.location::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           100000
         )
         ELSE $1::double precision IS NULL OR ST_DWithin(
           item.location::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         )
       END
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
      `SELECT alert.id, alert.emergency_type, alert.created_at,
              ST_Y(alert.location) AS latitude, ST_X(alert.location) AS longitude
       FROM sos_alerts AS alert
       LEFT JOIN users AS alert_author ON alert_author.id = alert.user_id
       WHERE alert.status = 'ACTIVE'
         AND CASE
           WHEN $5 = 'international' THEN TRUE
           WHEN $5 = 'country' THEN alert_author.country_code = $4
           WHEN $5 = 'neighborhood' THEN ST_DWithin(
             alert.location::geography,
             ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
             COALESCE(
               (SELECT default_radius_m FROM country_config WHERE code = $4),
               5000
             )
           )
           WHEN $5 = 'region' THEN ST_DWithin(
             alert.location::geography,
             ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
             100000
           )
           ELSE $1::double precision IS NULL OR ST_DWithin(
           alert.location::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         ) END
       ORDER BY alert.created_at DESC
       LIMIT 100`,
      filter.values,
    );
    return response.status(200).json({ alerts: result.rows });
  } catch (error) {
    return next(error);
  }
};
