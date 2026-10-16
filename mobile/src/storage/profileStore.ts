import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { getSharedDatabase } from "../services/database";

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
  theme: "light" | "dark" | "system";
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

const LEGACY_DATABASE_NAME = "quartierplus-profile.db";
const PREFERENCES_FALLBACK_KEY = "quartierplus.profile.preferences";
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const hasTable = async (database: SQLite.SQLiteDatabase, name: string) => {
  const table = await database.getFirstAsync<{ name: string }>(
    "SELECT name FROM legacy.sqlite_master WHERE type = 'table' AND name = ?",
    name,
  );
  return Boolean(table);
};

const openProfileDatabase = () => {
  if (databasePromise) return databasePromise;
  databasePromise = (async () => {
    const database = await getSharedDatabase();
    const migrated = await database.getFirstAsync<{ value: string }>(
      "SELECT value FROM profile.profile_settings WHERE key = 'legacy_store_migrated'",
    );
    if (migrated) return database;

    const legacyPath = `${SQLite.defaultDatabaseDirectory}/${LEGACY_DATABASE_NAME}`;
    await database.execAsync(
      `ATTACH DATABASE '${legacyPath.replaceAll("'", "''")}' AS legacy`,
    );
    let activeCountry: { value: string } | null;
    let contacts: TrustedContact[];
    try {
      const legacySettingsExist = await hasTable(database, "profile_settings");
      const legacyContactsExist = await hasTable(database, "trusted_contacts");
      activeCountry = legacySettingsExist
        ? await database.getFirstAsync<{ value: string }>(
            "SELECT value FROM legacy.profile_settings WHERE key = 'active_country'",
          )
        : null;
      contacts = legacyContactsExist
        ? await database.getAllAsync<TrustedContact>(
            "SELECT id, name, phone, position FROM legacy.trusted_contacts ORDER BY position",
          )
        : [];
    } finally {
      await database.execAsync("DETACH DATABASE legacy");
    }

    await database.withExclusiveTransactionAsync(async (transaction) => {
      if (activeCountry) {
        await transaction.runAsync(
          `INSERT INTO profile.profile_settings (key, value)
           VALUES ('active_country', ?)
           ON CONFLICT(key) DO NOTHING`,
          activeCountry.value,
        );
      }
      for (const contact of contacts) {
        await transaction.runAsync(
          `INSERT INTO profile.trusted_contacts (id, name, phone, position)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          contact.id,
          contact.name,
          contact.phone,
          contact.position,
        );
      }
      await transaction.runAsync(
        `INSERT INTO profile.profile_settings (key, value)
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
          "SELECT value FROM profile.profile_settings WHERE key = 'active_country'",
        );
      return saved ? (JSON.parse(saved.value) as StoredCountry) : null;
    },
    async setCountry(country) {
      await database.runAsync(
        `INSERT INTO profile.profile_settings (key, value)
         VALUES ('active_country', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify(country),
      );
    },
    getContacts() {
      return database.getAllAsync<TrustedContact>(
        "SELECT id, name, phone, position FROM profile.trusted_contacts ORDER BY position",
      );
    },
    async saveContact(contact) {
      await database.runAsync(
        `INSERT INTO profile.trusted_contacts (id, name, phone, position)
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
        await transaction.runAsync("DELETE FROM profile.trusted_contacts WHERE id = ?", id);
        for (const contact of remainingContacts) {
          await transaction.runAsync(
            "UPDATE profile.trusted_contacts SET position = ? WHERE id = ?",
            contact.position,
            contact.id,
          );
        }
      });
    },
    async getPreferences() {
      let rows: { key: string; value: string }[];
      try {
        rows = await database.getAllAsync<{ key: string; value: string }>(
          "SELECT key, value FROM app_preferences",
        );
      } catch (error) {
        console.warn("SQLite preferences are unavailable; using AsyncStorage.");
        let fallback: string | null;
        try {
          const { default: AsyncStorage } = await import(
            "@react-native-async-storage/async-storage"
          );
          fallback = await AsyncStorage.getItem(PREFERENCES_FALLBACK_KEY);
        } catch {
          fallback = await SecureStore.getItemAsync(PREFERENCES_FALLBACK_KEY);
        }
        if (!fallback) return defaultPreferences();
        try {
          return normalizePreferences(JSON.parse(fallback));
        } catch {
          throw new Error("Les préférences locales enregistrées sont invalides.");
        }
      }
      const values = new Map(rows.map((row) => [row.key, row.value]));
      return normalizePreferences({
        theme: values.get("theme"),
        language: values.get("language"),
        sosNotificationsEnabled: values.get("sos_notifications") !== "false",
        defaultRadiusKm: Number(values.get("default_radius_km")),
        voiceAssistantFloatingButton:
          values.get("voice_assistant_floating_button") === "true",
      });
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
      try {
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
      } catch (error) {
        console.warn("SQLite preferences are unavailable; using AsyncStorage.");
        try {
          const { default: AsyncStorage } = await import(
            "@react-native-async-storage/async-storage"
          );
          await AsyncStorage.setItem(
            PREFERENCES_FALLBACK_KEY,
            JSON.stringify(preferences),
          );
        } catch {
          await SecureStore.setItemAsync(
            PREFERENCES_FALLBACK_KEY,
            JSON.stringify(preferences),
          );
        }
      }
    },
  };
};

const defaultPreferences = (): AppPreferences => ({
  theme: "system",
  language: "fr",
  sosNotificationsEnabled: true,
  defaultRadiusKm: 3,
  voiceAssistantFloatingButton: false,
});

const normalizePreferences = (value: unknown): AppPreferences => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return defaultPreferences();
  }
  const preferences = value as Partial<AppPreferences>;
  const radius = Number(preferences.defaultRadiusKm);
  return {
    theme:
      preferences.theme === "dark" || preferences.theme === "system"
        ? preferences.theme
        : "light",
    language: preferences.language === "en" ? "en" : "fr",
    sosNotificationsEnabled: preferences.sosNotificationsEnabled !== false,
    defaultRadiusKm: radius === 10 || radius === 30 ? radius : 3,
    voiceAssistantFloatingButton:
      preferences.voiceAssistantFloatingButton === true,
  };
};
