jest.mock("expo-sqlite", () => ({
  defaultDatabaseDirectory: "/test-databases",
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock("../services/database", () => ({
  getSharedDatabase: jest.fn(),
}));

const { getSharedDatabase } = require("../services/database");
const { getProfileStorageDiagnostic, openProfileStore } = require("./profileStore");

describe("profile storage fallback", () => {
  it("retries failed SQLite initialization and keeps profile changes in memory", async () => {
    getSharedDatabase.mockRejectedValue(new Error("SQLite unavailable"));
    const errorLogger = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const store = await openProfileStore();
      expect(getSharedDatabase).toHaveBeenCalledTimes(3);
      expect(store.isMemoryFallback).toBe(true);
      expect(getProfileStorageDiagnostic()).toContain("Module : expo-sqlite");
      expect(getProfileStorageDiagnostic()).toContain("SQLite unavailable");

      const country = {
        code: "BF",
        emergencyNumbers: {
          police: "17",
          fire: "18",
          medical: "15",
        },
      };
      await store.setCountry(country);
      await store.saveContact({
        id: "contact-1",
        name: "Awa",
        phone: "+22670000000",
        position: 1,
      });
      await store.setPreferences({
        theme: "dark",
        language: "en",
        sosNotificationsEnabled: false,
        defaultRadiusKm: 10,
        voiceAssistantFloatingButton: true,
      });

      await expect(store.getCountry()).resolves.toEqual(country);
      await expect(store.getContacts()).resolves.toHaveLength(1);
      await expect(store.getPreferences()).resolves.toMatchObject({
        language: "en",
        voiceAssistantFloatingButton: true,
      });
    } finally {
      errorLogger.mockRestore();
    }
  });
});
