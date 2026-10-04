INSERT INTO country_config (
    code,
    name,
    phone_prefix,
    police_number,
    firefighters_number,
    ambulance_number
)
VALUES
    ('BF', 'Burkina Faso', '+226', '17', '18', '112'),
    ('CI', 'Côte d''Ivoire', '+225', '110', '180', '185'),
    ('SN', 'Sénégal', '+221', '17', '18', '1515'),
    ('ML', 'Mali', '+223', '17', '18', '15')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    phone_prefix = EXCLUDED.phone_prefix,
    police_number = EXCLUDED.police_number,
    firefighters_number = EXCLUDED.firefighters_number,
    ambulance_number = EXCLUDED.ambulance_number;

INSERT INTO channels (name, kind)
SELECT 'URGENCES', 'EMERGENCY'
WHERE NOT EXISTS (
    SELECT 1 FROM channels WHERE name = 'URGENCES'
);

INSERT INTO channels (name, kind)
SELECT 'ANNONCES', 'ANNOUNCEMENTS'
WHERE NOT EXISTS (
    SELECT 1 FROM channels WHERE name = 'ANNONCES'
);
