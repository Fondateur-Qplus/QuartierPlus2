import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import VoiceTextInput from "../../components/VoiceTextInput";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";

const countryOptions = [
  { code: "BF", name: "Burkina Faso" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "SN", name: "Sénégal" },
  { code: "ML", name: "Mali" },
];

const getErrorMessage = (error: unknown) => {
  if (
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
  ) {
    return error.response.data.error;
  }
  return error instanceof Error ? error.message : "Impossible d'enregistrer le profil.";
};

export default function CompleteProfileScreen() {
  const { user, refreshUser } = useAuth();
  const currentName = typeof user?.name === "string" ? user.name : "";
  const [firstName, setFirstName] = useState(currentName.split(/\s+/)[0] ?? "");
  const [lastName, setLastName] = useState(
    currentName.split(/\s+/).slice(1).join(" "),
  );
  const [neighborhood, setNeighborhood] = useState(
    typeof user?.neighborhood === "string" ? user.neighborhood : "",
  );
  const [countryCode, setCountryCode] = useState(
    typeof user?.country_code === "string" &&
      countryOptions.some((country) => country.code === user.country_code)
      ? user.country_code
      : "BF",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!currentName) return;
    const nameParts = currentName.trim().split(/\s+/);
    setFirstName(nameParts[0] ?? "");
    setLastName(nameParts.slice(1).join(" "));
  }, [currentName]);

  const saveProfile = async () => {
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const area = neighborhood.trim();
    if (!name || !area) {
      setError("Votre prénom, votre nom et votre quartier sont requis.");
      return;
    }
    if (name.length > 100 || area.length > 100) {
      setError("Le nom et le quartier doivent contenir au maximum 100 caractères.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await api.put("/v1/users/me", {
        name,
        neighborhood: area,
        country_code: countryCode,
      });
      await refreshUser();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.step}>
          <Text style={styles.stepText}>DERNIÈRE ÉTAPE</Text>
        </View>
        <Text style={styles.title}>Faisons connaissance</Text>
        <Text style={styles.subtitle}>
          Ces informations aident votre communauté à vous reconnaître et à vous proposer des services proches.
        </Text>

        <Text style={styles.label}>Prénom</Text>
        <VoiceTextInput
          autoCapitalize="words"
          autoComplete="given-name"
          onChangeText={setFirstName}
          placeholder="Votre prénom"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={firstName}
        />

        <Text style={styles.label}>Nom</Text>
        <VoiceTextInput
          autoCapitalize="words"
          autoComplete="family-name"
          onChangeText={setLastName}
          placeholder="Votre nom"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={lastName}
        />

        <Text style={styles.label}>Pays de résidence</Text>
        <View style={styles.countryList}>
          {countryOptions.map((country) => {
            const selected = country.code === countryCode;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={country.code}
                onPress={() => setCountryCode(country.code)}
                style={[styles.country, selected && styles.countrySelected]}
              >
                <Text style={[styles.countryText, selected && styles.countryTextSelected]}>
                  {country.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Quartier de résidence</Text>
        <VoiceTextInput
          autoCapitalize="words"
          onChangeText={setNeighborhood}
          placeholder="Ex. : Zogona, Cocody, Médina..."
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={neighborhood}
        />
        <Text style={styles.helper}>
          Indiquez votre quartier, sans partager votre adresse exacte.
        </Text>

        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveProfile()}
          style={[styles.button, isSaving && styles.buttonDisabled]}
        >
          {isSaving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Enregistrer et continuer</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { backgroundColor: "#f8fafc", flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 40 },
  step: { alignSelf: "flex-start", backgroundColor: "#dbeafe", borderRadius: 16, marginBottom: 16, paddingHorizontal: 12, paddingVertical: 7 },
  stepText: { color: "#1d4ed8", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: "#0f172a", fontSize: 27, fontWeight: "700" },
  subtitle: { color: "#64748b", fontSize: 15, lineHeight: 22, marginBottom: 22, marginTop: 8 },
  label: { color: "#334155", fontSize: 14, fontWeight: "600", marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 12, borderWidth: 1, color: "#0f172a", fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  countryList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  country: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  countrySelected: { backgroundColor: "#eff6ff", borderColor: "#2563eb" },
  countryText: { color: "#475569", fontSize: 13 },
  countryTextSelected: { color: "#1d4ed8", fontWeight: "600" },
  helper: { color: "#94a3b8", fontSize: 12, lineHeight: 17, marginTop: 8 },
  error: { color: "#b91c1c", fontSize: 14, marginTop: 14 },
  button: { alignItems: "center", backgroundColor: "#2563eb", borderRadius: 12, justifyContent: "center", marginTop: 24, minHeight: 52, paddingHorizontal: 16 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
