import { useEffect, useState } from "react";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth, type AuthUser } from "../../context/AuthContext";
import api from "../../services/api";

WebBrowser.maybeCompleteAuthSession();

const googleClientIds = {
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

const hasGoogleClientId = Object.values(googleClientIds).some(Boolean);

export default function GoogleAuthScreen() {
  const { setSession } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [request, response, promptAsync] = useIdTokenAuthRequest(googleClientIds);

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken =
      response.params.id_token ?? response.authentication?.idToken ?? null;
    if (!idToken) {
      Alert.alert("Connexion Google", "Google n'a pas renvoyé de jeton d'identité.");
      return;
    }
    let mounted = true;
    setIsLoading(true);
    void api
      .post("/api/v1/auth/google", { id_token: idToken })
      .then(async ({ data }) => {
        const result = data as { token?: unknown; user?: unknown };
        const user = result.user as AuthUser | undefined;
        if (typeof result.token !== "string" || !user || typeof user.id !== "string") {
          throw new Error("La réponse d'authentification Google est invalide.");
        }
        await setSession(result.token, user);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        const message =
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof error.response === "object" &&
          error.response !== null &&
          "data" in error.response &&
          typeof error.response.data === "object" &&
          error.response.data !== null &&
          "error" in error.response.data &&
          typeof error.response.data.error === "string"
            ? error.response.data.error
            : error instanceof Error
              ? error.message
              : "La connexion Google a échoué.";
        Alert.alert("Connexion Google", message);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [response, setSession]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !request || isLoading || !hasGoogleClientId }}
      disabled={!request || isLoading || !hasGoogleClientId}
      onPress={() => void promptAsync()}
      style={[
        styles.button,
        (!request || isLoading || !hasGoogleClientId) && styles.disabled,
      ]}
    >
      <View style={styles.googleMark}>
        <Text style={styles.googleMarkText}>G</Text>
      </View>
      <Text style={styles.buttonText}>
        {isLoading
          ? "Connexion en cours..."
          : hasGoogleClientId
            ? "Continuer avec Google"
            : "Google indisponible (configuration requise)"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  disabled: { opacity: 0.55 },
  googleMark: {
    alignItems: "center",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    marginRight: 10,
    width: 28,
  },
  googleMarkText: { color: "#4285f4", fontSize: 17, fontWeight: "800" },
  buttonText: { color: "#1e293b", fontSize: 15, fontWeight: "600" },
});
