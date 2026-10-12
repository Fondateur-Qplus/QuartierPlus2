import * as SQLite from "expo-sqlite";

export type EmergencyNumbers = {
  police: string;
  fire: string;
  medical: string;
};

export type TrustedContact = {
  id: string;
  name: string;
  phone: string;
  position: number;
};

export type StoredCountry = {
  code: string;
  emergencyNumbers: EmergencyNumbers;
};

export type AppPreferences = {
  theme: "light" | "dark";
  language: "fr" | "en";
  sosNotificationsEnabled: boolean;
  defaultRadiusKm: 3 | 10 | 30;
  voiceAssistantFloatingButton: boolean;
};

export type ProfileStore = {
  getCountry: () => Promise<StoredCountry | null>;
  setCountry: (country: StoredCountry) => Promise<void>;
  getContacts: () => Promise<TrustedContact[]>;
  saveContact: (contact: TrustedContact) => Promise<void>;
  deleteContact: (
    id: string,
    remainingContacts: TrustedContact[],
  ) => Promise<void>;
  getPreferences: () => Promise<AppPreferences>;
  setPreferences: (preferences: AppPreferences) => Promise<void>;
};

const DATABASE_NAME = "quartierplus.db";
const LEGACY_DATABASE_NAME = "quartierplus-profile.db";
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const hasTable = async (database: SQLite.SQLiteDatabase, name: string) => {
  const table = await database.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    name,
  );
  return Boolean(table);
};

const openProfileDatabase = () => {
  if (databasePromise) return databasePromise;
  databasePromise = (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS profile_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trusted_contacts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
    const migrated = await database.getFirstAsync<{ value: string }>(
      "SELECT value FROM profile_settings WHERE key = 'legacy_store_migrated'",
    );
    if (migrated) return database;

    const legacyDatabase = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
    const legacySettingsExist = await hasTable(legacyDatabase, "profile_settings");
    const legacyContactsExist = await hasTable(legacyDatabase, "trusted_contacts");
    const activeCountry = legacySettingsExist
      ? await legacyDatabase.getFirstAsync<{ value: string }>(
          "SELECT value FROM profile_settings WHERE key = 'active_country'",
        )
      : null;
    const contacts = legacyContactsExist
      ? await legacyDatabase.getAllAsync<TrustedContact>(
          "SELECT id, name, phone, position FROM trusted_contacts ORDER BY position",
        )
      : [];

    await database.withExclusiveTransactionAsync(async (transaction) => {
      if (activeCountry) {
        await transaction.runAsync(
          `INSERT INTO profile_settings (key, value)
           VALUES ('active_country', ?)
           ON CONFLICT(key) DO NOTHING`,
          activeCountry.value,
        );
      }
      for (const contact of contacts) {
        await transaction.runAsync(
          `INSERT INTO trusted_contacts (id, name, phone, position)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          contact.id,
          contact.name,
          contact.phone,
          contact.position,
        );
      }
      await transaction.runAsync(
        `INSERT INTO profile_settings (key, value)
         VALUES ('legacy_store_migrated', 'true')
         ON CONFLICT(key) DO NOTHING`,
      );
    });
    return database;
  })().catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
};

export const openProfileStore = async (): Promise<ProfileStore> => {
  const database = await openProfileDatabase();
  return {
    async getCountry() {
      const saved =
        await database.getFirstAsync<{ value: string }>(
          "SELECT value FROM profile_settings WHERE key = 'active_country'",
        );
      return saved ? (JSON.parse(saved.value) as StoredCountry) : null;
    },
    async setCountry(country) {
      await database.runAsync(
        `INSERT INTO profile_settings (key, value)
         VALUES ('active_country', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify(country),
      );
    },
    getContacts() {
      return database.getAllAsync<TrustedContact>(
        "SELECT id, name, phone, position FROM trusted_contacts ORDER BY position",
      );
    },
    async saveContact(contact) {
      await database.runAsync(
        `INSERT INTO trusted_contacts (id, name, phone, position)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           phone = excluded.phone,
           position = excluded.position`,
        contact.id,
        contact.name,
        contact.phone,
        contact.position,
      );
    },
    async deleteContact(id, remainingContacts) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync("DELETE FROM trusted_contacts WHERE id = ?", id);
        for (const contact of remainingContacts) {
          await transaction.runAsync(
            "UPDATE trusted_contacts SET position = ? WHERE id = ?",
            contact.position,
            contact.id,
          );
        }
      });
    },
    async getPreferences() {
      const rows = await database.getAllAsync<{ key: string; value: string }>(
        "SELECT key, value FROM app_preferences",
      );
      const values = new Map(rows.map((row) => [row.key, row.value]));
      const theme = values.get("theme");
      const language = values.get("language");
      const radius = Number(values.get("default_radius_km"));
      return {
        theme: theme === "dark" ? "dark" : "light",
        language: language === "en" ? "en" : "fr",
        sosNotificationsEnabled: values.get("sos_notifications") !== "false",
        defaultRadiusKm: radius === 10 || radius === 30 ? radius : 3,
        voiceAssistantFloatingButton:
          values.get("voice_assistant_floating_button") === "true",
      };
    },
    async setPreferences(preferences) {
      const entries: [string, string][] = [
        ["theme", preferences.theme],
        ["language", preferences.language],
        ["sos_notifications", String(preferences.sosNotificationsEnabled)],
        ["default_radius_km", String(preferences.defaultRadiusKm)],
        [
          "voice_assistant_floating_button",
          String(preferences.voiceAssistantFloatingButton),
        ],
      ];
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const [key, value] of entries) {
          await transaction.runAsync(
            `INSERT INTO app_preferences (key, value)
             VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            key,
            value,
          );
        }
      });
    },
  };
};
