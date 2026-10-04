import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth, type AuthUser } from "../../context/AuthContext";
import api from "../../services/api";
import GoogleAuthScreen from "./GoogleAuthScreen";

const COUNTRIES = [
  { name: "Burkina Faso", prefix: "+226" },
  { name: "Côte d'Ivoire", prefix: "+225" },
  { name: "Sénégal", prefix: "+221" },
  { name: "Mali", prefix: "+223" },
];

const responseError = (error: unknown, fallback: string) => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;
    if (typeof response === "object" && response !== null && "data" in response) {
      const data = response.data;
      if (typeof data === "object" && data !== null && "error" in data) {
        const message = data.error;
        if (typeof message === "string") return message;
      }
    }
  }
  return error instanceof Error ? error.message : fallback;
};

export default function PhoneAuthScreen() {
  const { setSession } = useAuth();
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsRemaining <= 0) return undefined;
    const timer = setTimeout(() => {
      setSecondsRemaining((remaining) => Math.max(remaining - 1, 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const fullPhoneNumber = () => {
    const nationalNumber = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (nationalNumber.length < 6 || nationalNumber.length > 12) {
      throw new Error("Saisissez un numéro de téléphone valide.");
    }
    return `${selectedCountry.prefix}${nationalNumber}`;
  };

  const requestOtp = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await api.post("/api/v1/auth/request-otp", {
        phone_number: fullPhoneNumber(),
      });
      setOtpRequested(true);
      setOtp("");
      setSecondsRemaining(60);
    } catch (requestError) {
      setError(responseError(requestError, "Impossible d'envoyer le code SMS."));
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await api.post("/api/v1/auth/verify-otp", {
        phone_number: fullPhoneNumber(),
        code: otp,
      });
      const data = response.data as { token?: unknown; user?: unknown };
      const user = data.user as AuthUser | undefined;
      if (typeof data.token !== "string" || !user || typeof user.id !== "string") {
        throw new Error("La réponse d'authentification est invalide.");
      }
      await setSession(data.token, user);
    } catch (verificationError) {
      setError(responseError(verificationError, "La vérification a échoué."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>Q+</Text>
        </View>
        <Text style={styles.title}>Bienvenue sur QuartierPlus</Text>
        <Text style={styles.subtitle}>
          Connectez-vous pour retrouver les services et les voisins de votre quartier.
        </Text>

        <Text style={styles.label}>Pays</Text>
        <View style={styles.countryList}>
          {COUNTRIES.map((country) => {
            const selected = selectedCountry.prefix === country.prefix;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={country.prefix}
                onPress={() => setSelectedCountry(country)}
                style={[styles.countryOption, selected && styles.countryOptionSelected]}
              >
                <Text
                  style={[
                    styles.countryOptionText,
                    selected && styles.countryOptionTextSelected,
                  ]}
                >
                  {country.name} {country.prefix}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Numéro de téléphone</Text>
        <View style={styles.phoneInput}>
          <Text style={styles.prefix}>{selectedCountry.prefix}</Text>
          <TextInput
            accessibilityLabel="Numéro de téléphone"
            autoComplete="tel-national"
            keyboardType="phone-pad"
            maxLength={15}
            onChangeText={setPhone}
            placeholder="Votre numéro"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={phone}
          />
        </View>

        {otpRequested && (
          <>
            <Text style={[styles.label, styles.otpLabel]}>Code de vérification</Text>
            <TextInput
              accessibilityLabel="Code OTP à six chiffres"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setOtp(value.replace(/\D/g, ""))}
              placeholder="••••••"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.otpInput]}
              value={otp}
            />
            <Pressable
              accessibilityRole="button"
              disabled={secondsRemaining > 0 || isLoading}
              onPress={() => void requestOtp()}
            >
              <Text
                style={[
                  styles.resend,
                  (secondsRemaining > 0 || isLoading) && styles.disabledText,
                ]}
              >
                {secondsRemaining > 0
                  ? `Renvoyer le code dans ${secondsRemaining}s`
                  : "Renvoyer le code"}
              </Text>
            </Pressable>
          </>
        )}

        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        <Pressable
          accessibilityRole="button"
          disabled={isLoading || (otpRequested && otp.length !== 6)}
          onPress={() => void (otpRequested ? verifyOtp() : requestOtp())}
          style={[
            styles.primaryButton,
            (isLoading || (otpRequested && otp.length !== 6)) && styles.buttonDisabled,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {otpRequested ? "Vérifier et continuer" : "Recevoir un code SMS"}
            </Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ou</Text>
          <View style={styles.dividerLine} />
        </View>
        <GoogleAuthScreen />
        <Text style={styles.privacy}>
          En continuant, vous acceptez que votre numéro soit utilisé pour sécuriser votre compte.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 40 },
  brandMark: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#2563eb",
    borderRadius: 18,
    height: 64,
    justifyContent: "center",
    marginBottom: 20,
    width: 64,
  },
  brandMarkText: { color: "#ffffff", fontSize: 24, fontWeight: "800" },
  title: { color: "#0f172a", fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { color: "#64748b", fontSize: 15, lineHeight: 22, marginBottom: 28, marginTop: 10, textAlign: "center" },
  label: { color: "#334155", fontSize: 14, fontWeight: "600", marginBottom: 8, marginTop: 14 },
  countryList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  countryOption: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  countryOptionSelected: { backgroundColor: "#eff6ff", borderColor: "#2563eb" },
  countryOptionText: { color: "#475569", fontSize: 12 },
  countryOptionTextSelected: { color: "#1d4ed8", fontWeight: "600" },
  phoneInput: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 12, borderWidth: 1, flexDirection: "row", paddingHorizontal: 14 },
  prefix: { color: "#0f172a", fontSize: 16, fontWeight: "600", marginRight: 10 },
  input: { color: "#0f172a", flex: 1, fontSize: 16, minHeight: 52 },
  otpLabel: { marginTop: 20 },
  otpInput: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 12, borderWidth: 1, flex: 0, fontSize: 22, letterSpacing: 10, textAlign: "center" },
  resend: { color: "#2563eb", fontSize: 14, fontWeight: "600", marginTop: 10, textAlign: "right" },
  disabledText: { color: "#94a3b8" },
  error: { color: "#b91c1c", fontSize: 14, marginTop: 14 },
  primaryButton: { alignItems: "center", backgroundColor: "#2563eb", borderRadius: 12, justifyContent: "center", marginTop: 22, minHeight: 52, paddingHorizontal: 16 },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  divider: { alignItems: "center", flexDirection: "row", gap: 12, marginVertical: 22 },
  dividerLine: { backgroundColor: "#e2e8f0", flex: 1, height: 1 },
  dividerText: { color: "#94a3b8", fontSize: 13 },
  privacy: { color: "#94a3b8", fontSize: 12, lineHeight: 18, marginTop: 22, textAlign: "center" },
});
