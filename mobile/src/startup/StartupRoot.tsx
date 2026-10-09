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
  | { status: "error"; message: string };

type CrashlyticsClient = {
  recordError: (error: Error) => void;
};

type StartupRootProps = {
  crashlyticsClient: CrashlyticsClient | null;
  crashlyticsStartupPromise: Promise<string | null>;
};

const requiredEnvironment = [
  ["EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL],
  [
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  ],
] as const;

const validateEnv = () =>
  requiredEnvironment
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

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

class RootErrorBoundary extends Component<
  PropsWithChildren<{ crashlyticsClient: CrashlyticsClient | null }>,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    recordSanitizedError("React root render error", this.props.crashlyticsClient);
  }

  render() {
    if (this.state.hasError) {
      return (
        <StartupError
          message="Une erreur empêche l'affichage de l'application. Redémarrez-la ou contactez le support."
        />
      );
    }
    return this.props.children;
  }
}

function StartupError({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        QuartierPlus n'a pas pu démarrer
      </Text>
      <Text selectable style={styles.message}>
        {message}
      </Text>
    </View>
  );
}

export default function StartupRoot({
  crashlyticsClient,
  crashlyticsStartupPromise,
}: StartupRootProps) {
  const [startup, setStartup] = useState<StartupState>({ status: "loading" });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const missingVariables = validateEnv();
      const firebaseError = await crashlyticsStartupPromise;
      if (firebaseError) {
        recordSanitizedError(
          "Firebase Crashlytics initialization failed",
          crashlyticsClient,
        );
        if (mounted) {
          setStartup({ status: "error", message: firebaseError });
        }
        return;
      }

      if (missingVariables.length > 0) {
        recordSanitizedError(
          `Required app configuration is missing: ${missingVariables.join(", ")}`,
          crashlyticsClient,
        );
        if (mounted) {
          setStartup({
            status: "error",
            message: `Configuration manquante : ${missingVariables.join(", ")}`,
          });
        }
        return;
      }

      try {
        require("@livekit/react-native").registerGlobals();
      } catch (_error) {
        recordSanitizedError("LiveKit/WebRTC initialization failed", crashlyticsClient);
        if (mounted) {
          setStartup({
            status: "error",
            message:
              "Le module LiveKit/WebRTC n'a pas pu démarrer. Vérifiez sa configuration native et reconstruisez l'application.",
          });
        }
        return;
      }

      try {
        const App = require("../../App").default as ComponentType;
        if (mounted) setStartup({ status: "ready", App });
      } catch (_error) {
        recordSanitizedError(
          "A required application or native module failed to load",
          crashlyticsClient,
        );
        if (mounted) {
          setStartup({
            status: "error",
            message:
              "Un module requis n'a pas pu être chargé. Vérifiez la compilation Android et la configuration des modules natifs.",
          });
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [crashlyticsClient, crashlyticsStartupPromise]);

  if (startup.status === "error") {
    return <StartupError message={startup.message} />;
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
    <RootErrorBoundary crashlyticsClient={crashlyticsClient}>
      <App />
    </RootErrorBoundary>
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
});
