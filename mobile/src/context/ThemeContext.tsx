import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Appearance, useColorScheme } from "react-native";
import {
  openProfileStore,
  type AppPreferences,
} from "../storage/profileStore";

export type ThemeChoice = "light" | "dark" | "system";
export type Language = "fr" | "en";

export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  secondaryText: string;
  border: string;
  primary: string;
  danger: string;
  muted: string;
  onPrimary: string;
  overlay: string;
};

const palettes: Record<"light" | "dark", ThemeColors> = {
  light: {
    background: "#f8fafc",
    card: "#ffffff",
    text: "#0f172a",
    secondaryText: "#64748b",
    border: "#e2e8f0",
    primary: "#2563eb",
    danger: "#dc2626",
    muted: "#f1f5f9",
    onPrimary: "#ffffff",
    overlay: "rgba(15,23,42,0.62)",
  },
  dark: {
    background: "#0f172a",
    card: "#1e293b",
    text: "#f8fafc",
    secondaryText: "#cbd5e1",
    border: "#334155",
    primary: "#60a5fa",
    danger: "#f87171",
    muted: "#334155",
    onPrimary: "#0f172a",
    overlay: "rgba(0,0,0,0.72)",
  },
};

const translations = {
  fr: {
    tabHome: "Accueil",
    tabMap: "Carte",
    tabMarket: "Marché",
    tabMessages: "Messages",
    tabProfile: "Profil",
    themeTitle: "Thème de l'application",
    themeLight: "Clair",
    themeDark: "Sombre",
    themeSystem: "Système",
    languageTitle: "Langue",
    languageFrench: "Français",
    languageEnglish: "English",
    save: "Enregistrer",
    cancel: "Annuler",
    retry: "Réessayer",
    search: "Rechercher",
    publish: "Publier",
    send: "Envoyer",
    create: "Créer",
    close: "Fermer",
    marketListings: "Annonces",
    marketLocal: "Local / Made in",
    marketServices: "Services & Métiers",
    marketAll: "Tous",
    marketCreateListing: "Déposer une annonce",
    marketTitle: "Marché du Quartier",
    profileActivities: "Mes Activités",
    profileEmergencyContacts: "Mes Contacts SOS Personnels",
    profileVoiceAssistant: "Assistant vocal",
    profileSettings: "Confidentialité & Paramètres",
    profileLogout: "Déconnexion",
    profileAbout: "À propos",
    messagesPrivate: "Privés",
    messagesChannels: "Canaux",
    messagesSend: "Envoyer",
    messagesEmergency: "URGENCES",
    messagesAnnouncements: "ANNONCES",
  },
  en: {
    tabHome: "Home",
    tabMap: "Map",
    tabMarket: "Market",
    tabMessages: "Messages",
    tabProfile: "Profile",
    themeTitle: "App theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    languageTitle: "Language",
    languageFrench: "Français",
    languageEnglish: "English",
    save: "Save",
    cancel: "Cancel",
    retry: "Retry",
    search: "Search",
    publish: "Publish",
    send: "Send",
    create: "Create",
    close: "Close",
    marketListings: "Listings",
    marketLocal: "Local / Made in",
    marketServices: "Services & Trades",
    marketAll: "All",
    marketCreateListing: "Create a listing",
    marketTitle: "Neighborhood Market",
    profileActivities: "My Activity",
    profileEmergencyContacts: "My SOS Contacts",
    profileVoiceAssistant: "Voice assistant",
    profileSettings: "Privacy & Settings",
    profileLogout: "Log out",
    profileAbout: "About",
    messagesPrivate: "Private",
    messagesChannels: "Channels",
    messagesSend: "Send",
    messagesEmergency: "EMERGENCY",
    messagesAnnouncements: "ANNOUNCEMENTS",
  },
} as const;

type TranslationKey = keyof typeof translations.fr;
type ThemeContextValue = {
  theme: ThemeChoice;
  colors: ThemeColors;
  language: Language;
  setTheme: (theme: ThemeChoice) => void;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const preferencesChangedRef = useRef(false);
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [language, setLanguageState] = useState<Language>("fr");

  useEffect(() => {
    let active = true;
    void openProfileStore()
      .then((store) => store.getPreferences())
      .then((preferences) => {
        if (!active) return;
        if (preferencesChangedRef.current) return;
        setThemeState(preferences.theme);
        setLanguageState(preferences.language);
      })
      .catch((error: unknown) => {
        console.warn("Unable to load saved appearance and language settings.", error);
      });
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    preferencesChangedRef.current = true;
    setThemeState(next);
    Appearance.setColorScheme(next === "system" ? "unspecified" : next);
  }, []);
  const setLanguage = useCallback(
    (next: Language) => {
      preferencesChangedRef.current = true;
      setLanguageState(next);
    },
    [],
  );
  const resolvedTheme =
    theme === "system" ? (systemScheme === "dark" ? "dark" : "light") : theme;
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: palettes[resolvedTheme],
      language,
      setTheme,
      setLanguage,
      t: (key) => translations[language][key],
    }),
    [language, resolvedTheme, setLanguage, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }
  return context;
}

export type { AppPreferences };
