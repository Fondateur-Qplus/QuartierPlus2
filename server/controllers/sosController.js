import { pool } from "../db/pool.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validAlertId = (request, response) => {
  if (UUID_PATTERN.test(request.params.id)) return true;
  response.status(400).json({ error: "Identifiant d'alerte invalide." });
  return false;
};

export const assistSosAlert = async (request, response, next) => {
  if (!validAlertId(request, response)) return;
  try {
    const result = await pool.query(
      `INSERT INTO sos_assists (sos_id, user_id)
       SELECT alert.id, $2
       FROM sos_alerts AS alert
       WHERE alert.id = $1 AND alert.status = 'ACTIVE'
       ON CONFLICT (sos_id, user_id) DO NOTHING
       RETURNING sos_id`,
      [request.params.id, request.auth.userId],
    );
    if (result.rowCount === 0) {
      const existing = await pool.query(
        "SELECT status FROM sos_alerts WHERE id = $1",
        [request.params.id],
      );
      if (existing.rows[0]?.status !== "ACTIVE") {
        return response.status(404).json({ error: "Alerte active introuvable." });
      }
    }
    return response.status(result.rowCount ? 201 : 200).json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

export const reportSosAlert = async (request, response, next) => {
  if (!validAlertId(request, response)) return;
  try {
    const result = await pool.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason)
       SELECT $2, 'SOS', alert.id, 'Alerte SOS potentiellement erronée'
       FROM sos_alerts AS alert
       WHERE alert.id = $1 AND alert.status = 'ACTIVE'
       RETURNING id`,
      [request.params.id, request.auth.userId],
    );
    if (result.rowCount === 0) {
      return response.status(404).json({ error: "Alerte active introuvable." });
    }
    return response.status(201).json({ ok: true, report_id: result.rows[0].id });
  } catch (error) {
    return next(error);
  }
};