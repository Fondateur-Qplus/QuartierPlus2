import {
  Component,
  useEffect,
  useState,
  type ComponentType,
  type ErrorInfo,
  type PropsWithChildren,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type StartupState =
  | { status: "loading" }
  | { status: "ready"; App: ComponentType }
  | { status: "error"; message: string; error: unknown };

type CrashlyticsClient = {
  recordError: (error: Error) => void;
};

type StartupRootProps = {
  crashlyticsClient: CrashlyticsClient | null;
  firebaseStartupError: unknown | null;
  crashlyticsStartupPromise: Promise<unknown | null>;
};

const requiredEnvironment = [
  ["EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL],
  ["EXPO_PUBLIC_FIREBASE_PROJECT_ID", process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID],
  ["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY],
  ["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID],
  ["EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID", process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID],
] as const;

const appConfiguration = require("../../app.json").expo;
const sensitiveConfigurationValues = [
  process.env.EXPO_PUBLIC_API_URL,
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
]
  .filter((value): value is string => Boolean(value?.trim()))
  .map((value) => value.trim());

const validateEnv = () =>
  requiredEnvironment
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

const maskSensitiveConfigurationValues = (value: string) =>
  sensitiveConfigurationValues.reduce(
    (message, sensitiveValue) =>
      message.split(sensitiveValue).join("[valeur masquée]"),
    value,
  );

const recordSanitizedError = (
  message: string,
  crashlyticsClient: CrashlyticsClient | null,
) => {
  if (!crashlyticsClient) return;
  try {
    crashlyticsClient.recordError(new Error(message));
  } catch {
    console.error("Crashlytics est indisponible pour l'erreur de démarrage.");
  }
};

const sanitizeDiagnosticText = (value: string) =>
  maskSensitiveConfigurationValues(value)
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, "[URL masquée]")
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?/gi, "[URL masquée]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/[^\s]*)?/g, "[URL masquée]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [masqué]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[clé masquée]")
    .replace(/\b[A-Za-z0-9._-]+\.apps\.googleusercontent\.com\b/gi, "[identifiant masqué]")
    .replace(/\b\d+:[0-9]+:(?:android|ios):[A-Fa-f0-9]+\b/g, "[identifiant Firebase masqué]")
    .replace(
      /\b((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|secret|authorization))\s*[:=]\s*["']?[^,\s;"']+/gi,
      "$1=[masqué]",
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[valeur masquée]");

const getDiagnostic = (error: unknown) => {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const name = record && typeof record.name === "string" ? record.name : "Error";
  const code =
    record && (typeof record.code === "string" || typeof record.code === "number")
      ? String(record.code)
      : "—";
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : record && typeof record.message === "string"
          ? record.message
          : "Aucun message d'erreur";

  return {
    name: sanitizeDiagnosticText(name).slice(0, 80),
    code: sanitizeDiagnosticText(code).slice(0, 80),
    message: sanitizeDiagnosticText(rawMessage).slice(0, 300),
  };
};

class RootErrorBoundary extends Component<
  PropsWithChildren<{ crashlyticsClient: CrashlyticsClient | null }>,
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    recordSanitizedError("React root render error", this.props.crashlyticsClient);
  }

  render() {
    if (this.state.error) {
      return (
        <StartupError
          error={this.state.error}
          message="Une erreur empêche l'affichage de l'application. Redémarrez-la ou contactez le support."
        />
      );
    }
    return this.props.children;
  }
}

function TechnicalDetails({ error }: { error: unknown }) {
  const diagnostic = getDiagnostic(error);
  return (
    <View style={styles.details}>
      <Text style={styles.detailsTitle}>Détails techniques</Text>
      <Text selectable style={styles.detailsText}>
        Nom : {diagnostic.name}
        {"\n"}Code : {diagnostic.code}
        {"\n"}Message : {diagnostic.message}
        {"\n"}Version : {appConfiguration.version}
        {"\n"}Package : {appConfiguration.android.package}
      </Text>
    </View>
  );
}

function StartupError({
  error,
  message,
}: {
  error: unknown;
  message: string;
}) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        QuartierPlus n'a pas pu démarrer
      </Text>
      <Text selectable style={styles.message}>
        {message}
      </Text>
      <TechnicalDetails error={error} />
    </View>
  );
}

export default function StartupRoot({
  crashlyticsClient,
  firebaseStartupError,
  crashlyticsStartupPromise,
}: StartupRootProps) {
  const [startup, setStartup] = useState<StartupState>({ status: "loading" });
  const [crashlyticsUnavailable, setCrashlyticsUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;

    const missingVariables = validateEnv();
    if (missingVariables.length > 0) {
      const message = `Configuration manquante : ${missingVariables.join(", ")}`;
      recordSanitizedError(message, crashlyticsClient);
      setStartup({
        status: "error",
        message,
        error: Object.assign(new Error(message), {
          name: "ConfigurationError",
          code: "MISSING_CONFIG",
        }),
      });
      return () => {
        mounted = false;
      };
    }

    if (firebaseStartupError) {
      recordSanitizedError("Firebase native app initialization failed", crashlyticsClient);
    }

    void crashlyticsStartupPromise.then(
      (error) => {
        if (mounted && error) setCrashlyticsUnavailable(true);
      },
      () => {
        if (mounted) setCrashlyticsUnavailable(true);
      },
    );

    try {
      require("@livekit/react-native").registerGlobals();
    } catch (error) {
      recordSanitizedError("LiveKit/WebRTC initialization failed", crashlyticsClient);
      setStartup({
        status: "error",
        message:
          "Le module LiveKit/WebRTC n'a pas pu démarrer. Vérifiez sa configuration native et reconstruisez l'application.",
        error,
      });
      return () => {
        mounted = false;
      };
    }

    try {
      const App = require("../../App").default as ComponentType;
      setStartup({ status: "ready", App });
    } catch (error) {
      recordSanitizedError(
        "A required application or native module failed to load",
        crashlyticsClient,
      );
      setStartup({
        status: "error",
        message:
          "Un module requis n'a pas pu être chargé. Vérifiez la compilation Android et la configuration des modules natifs.",
        error,
      });
    }

    return () => {
      mounted = false;
    };
  }, [crashlyticsClient, crashlyticsStartupPromise, firebaseStartupError]);

  if (startup.status === "error") {
    return <StartupError error={startup.error} message={startup.message} />;
  }
  if (startup.status === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#2563eb" size="large" />
        <Text style={styles.message}>Démarrage de QuartierPlus…</Text>
      </View>
    );
  }

  const App = startup.App;
  return (
    <View style={styles.appContainer}>
      {firebaseStartupError ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          Firebase est indisponible ; certaines fonctionnalités peuvent être limitées.
        </Text>
      ) : null}
      {crashlyticsUnavailable ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          Crashlytics est indisponible ; les rapports d'erreur ne seront pas envoyés.
        </Text>
      ) : null}
      <RootErrorBoundary crashlyticsClient={crashlyticsClient}>
        <App />
      </RootErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  appContainer: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  title: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    color: "#334155",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  details: {
    alignSelf: "stretch",
    backgroundColor: "#e2e8f0",
    borderRadius: 8,
    marginTop: 20,
    padding: 12,
  },
  detailsTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  detailsText: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 18,
  },
  warning: {
    backgroundColor: "#fef3c7",
    color: "#78350f",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: "center",
  },
});
