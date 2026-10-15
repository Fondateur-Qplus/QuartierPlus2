import { pool } from "../db/pool.js";

export const ensureDefaultChannels = async () => {
  await pool.query(
    `INSERT INTO channels (name, kind, country_code)
     SELECT channel.name, channel.kind, country.code
     FROM country_config AS country
     CROSS JOIN (
       VALUES ('URGENCES', 'EMERGENCY'), ('ANNONCES', 'ANNOUNCEMENTS')
     ) AS channel(name, kind)
     ON CONFLICT (country_code, kind)
       WHERE country_code IS NOT NULL
     DO UPDATE SET name = EXCLUDED.name`,
  );
};
