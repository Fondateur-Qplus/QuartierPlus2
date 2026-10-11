import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth, type AuthUser } from "../../context/AuthContext";
import api from "../../services/api";

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
const validGoogleWebClientId =
  /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(googleWebClientId);

export default function GoogleAuthScreen() {
  const { setSession } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(!validGoogleWebClientId);

  const signIn = async () => {
    if (!validGoogleWebClientId || isLoading) {
      setUnavailable(true);
      return;
    }
    setIsLoading(true);
    setUnavailable(false);
    try {
      const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
      GoogleSignin.configure({ webClientId: googleWebClientId });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (result.type === "cancelled") return;
      const idToken = result.data.idToken;
      if (!idToken) {
        setUnavailable(true);
        return;
      }

      const { data } = await api.post("/api/v1/auth/google", {
        id_token: idToken,
      });
      const response = data as { token?: unknown; user?: unknown };
      const user = response.user as AuthUser | undefined;
      if (typeof response.token !== "string" || !user || typeof user.id !== "string") {
        throw new Error("La réponse de connexion Google est invalide.");
      }
      await setSession(response.token, user);
    } catch {
      console.warn("La connexion Google native est indisponible.");
      setUnavailable(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isLoading || unavailable }}
      disabled={isLoading || unavailable}
      onPress={() => void signIn()}
      style={[styles.button, (isLoading || unavailable) && styles.disabled]}
    >
      <View style={styles.googleMark}>
        <Text style={styles.googleMarkText}>G</Text>
      </View>
      <Text style={styles.buttonText}>
        {isLoading
          ? "Connexion en cours..."
          : unavailable
            ? "Google bientôt disponible"
            : "Continuer avec Google"}
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
