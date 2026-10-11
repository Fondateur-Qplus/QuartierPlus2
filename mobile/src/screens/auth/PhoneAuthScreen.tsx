import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import type { RootStackParamList } from "../../navigation/types";

type PhoneCountry = {
  code: string;
  name: string;
  prefix: string;
};

type AuthMode = "login" | "register";

const FALLBACK_COUNTRIES: PhoneCountry[] = [
  { code: "BF", name: "Burkina Faso", prefix: "+226" },
  { code: "CI", name: "Côte d'Ivoire", prefix: "+225" },
  { code: "SN", name: "Sénégal", prefix: "+221" },
  { code: "ML", name: "Mali", prefix: "+223" },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parsePhoneCountries = (value: unknown): PhoneCountry[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("La liste des pays renvoyée par l'API est invalide.");
  }
  const countries = value.map((item): PhoneCountry => {
    if (
      !isRecord(item) ||
      typeof item.code !== "string" ||
      !/^[A-Z]{2,3}$/.test(item.code) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      typeof item.phone_prefix !== "string" ||
      !/^\+[1-9]\d{0,3}$/.test(item.phone_prefix)
    ) {
      throw new Error("La liste des pays renvoyée par l'API est invalide.");
    }
    return { code: item.code, name: item.name, prefix: item.phone_prefix };
  });
  if (new Set(countries.map((country) => country.code)).size !== countries.length) {
    throw new Error("La liste des pays renvoyée par l'API contient des doublons.");
  }
  return countries;
};

const normalizeCountrySearch = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

const AUTH_WAKE_TIMEOUT_MS = 60_000;
const AUTH_RETRY_TIMEOUT_MS = 15_000;
const AUTH_RETRY_DELAY_MS = 2_000;

const requestWhileServerWakes = async <T,>(path: string, data: unknown) => {
  const deadline = Date.now() + AUTH_WAKE_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    try {
      return await api.post<T>(path, data, {
        timeout: Math.min(AUTH_RETRY_TIMEOUT_MS, remaining),
      });
    } catch (error) {
      lastError = error;
      const apiError =
        axios.isAxiosError(error) &&
        isRecord(error.response?.data) &&
        typeof error.response.data.error === "string";
      const retryable =
        axios.isAxiosError(error) &&
        (!error.response ||
          (!apiError && [502, 503, 504].includes(error.response.status)));
      if (!retryable) throw error;
      const wait = Math.min(AUTH_RETRY_DELAY_MS, deadline - Date.now());
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }

  if (lastError && !axios.isAxiosError(lastError)) throw lastError;
  throw new Error(
    "Le serveur met plus de temps que prévu à se réveiller. Réessayez dans un instant.",
  );
};

const responseError = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const responseData: unknown = error.response?.data;
    if (
      isRecord(responseData) &&
      typeof responseData.error === "string" &&
      responseData.error.trim()
    ) {
      return responseData.error;
    }
    if (!error.response || error.code === "ECONNABORTED") {
      return "Le serveur met plus de temps que prévu à se réveiller. Réessayez dans un instant.";
    }
  }
  return error instanceof Error ? error.message : fallback;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function PhoneAuthScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "PhoneAuth">>();
  const { setSession, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>(route.params?.mode ?? "login");
  const [countries, setCountries] = useState(FALLBACK_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState(FALLBACK_COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState("");
  const [countryListError, setCountryListError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerRegistration, setOfferRegistration] = useState(false);

  const visibleCountries = useMemo(() => {
    const query = normalizeCountrySearch(countrySearch.trim());
    if (query) {
      return countries
        .filter((country) =>
          normalizeCountrySearch(`${country.name} ${country.code} ${country.prefix}`).includes(query),
        )
        .slice(0, 24);
    }
    const preferredCodes = [selectedCountry.code, "BF", "CI", "SN", "ML"];
    return preferredCodes
      .map((code) => countries.find((country) => country.code === code))
      .filter((country): country is PhoneCountry => Boolean(country))
      .filter(
        (country, index, all) =>
          all.findIndex((candidate) => candidate.code === country.code) === index,
      );
  }, [countries, countrySearch, selectedCountry.code]);

  useEffect(() => {
    let mounted = true;
    void api
      .get<{ countries?: unknown }>("/api/v1/auth/countries")
      .then((response) => {
        const loadedCountries = parsePhoneCountries(response.data.countries);
        if (!mounted) return;
        setCountries(loadedCountries);
        setSelectedCountry(
          (current) =>
            loadedCountries.find((country) => country.code === current.code) ??
            loadedCountries[0],
        );
        setCountryListError(null);
      })
      .catch(() => {
        if (mounted) {
          setCountryListError(
            "La liste des pays est indisponible; les quatre pays principaux restent proposés.",
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const hasCompletedProfile =
      typeof user.name === "string" && user.name.trim().length > 0;
    if (!hasCompletedProfile) {
      navigation.replace("CompleteProfile");
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace("Main", { screen: "Accueil" });
    }
  }, [navigation, user]);

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

  const normalizedIdentifier = () => {
    const value = identifier.trim();
    if (value.includes("@")) return value.toLowerCase();
    return `+${value.replace(/\D/g, "")}`;
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setOfferRegistration(false);
    setOtpRequested(false);
    setOtp("");
  };

  const requestOtp = async () => {
    setError(null);
    setOfferRegistration(false);

    let payload: Record<string, unknown>;
    try {
      if (mode === "register") {
        if (!firstName.trim() || !lastName.trim()) {
          throw new Error("Saisissez votre prénom et votre nom.");
        }
        if (firstName.trim().length > 100 || lastName.trim().length > 100) {
          throw new Error("Le prénom et le nom ne doivent pas dépasser 100 caractères.");
        }
        if (`${firstName.trim()} ${lastName.trim()}`.length > 100) {
          throw new Error("Le prénom et le nom réunis ne doivent pas dépasser 100 caractères.");
        }
        if (!isValidEmail(email)) {
          throw new Error("Saisissez une adresse e-mail valide.");
        }
        if (!termsAccepted) {
          throw new Error("Vous devez accepter les conditions et la politique de confidentialité.");
        }
        payload = {
          flow: "register",
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          country_code: selectedCountry.code,
          phone_number: fullPhoneNumber(),
          email: email.trim().toLowerCase(),
          terms_accepted: true,
        };
      } else {
        const normalized = normalizedIdentifier();
        if (
          !/^\+[1-9]\d{7,14}$/.test(normalized) &&
          !isValidEmail(normalized)
        ) {
          throw new Error("Saisissez un téléphone avec indicatif (+226…) ou une adresse e-mail valide.");
        }
        payload = { flow: "login", identifier: normalized };
      }
    } catch (validationError) {
      setError(responseError(validationError, "Vérifiez les informations saisies."));
      return;
    }

    setIsLoading(true);
    try {
      await requestWhileServerWakes("/api/v1/auth/request-otp", payload);
      setOtpRequested(true);
      setOtp("");
      setSecondsRemaining(60);
    } catch (requestError) {
      const message = responseError(requestError, "Impossible d'envoyer le code de vérification.");
      setError(message);
      if (axios.isAxiosError(requestError) && requestError.response?.status === 404) {
        setOfferRegistration(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const challengeIdentifier =
        mode === "register" ? fullPhoneNumber() : normalizedIdentifier();
      const response = await requestWhileServerWakes<{
        token?: unknown;
        user?: unknown;
      }>("/api/v1/auth/verify-otp", {
        identifier: challengeIdentifier,
        code: otp,
      });
      const data = response.data;
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
        <Text style={styles.title}>
          {mode === "register" ? "Créer votre compte" : "Bienvenue sur QuartierPlus"}
        </Text>
        <Text style={styles.subtitle}>
          {mode === "register"
            ? "Rejoignez votre communauté en quelques étapes."
            : "Connectez-vous avec votre téléphone ou votre adresse e-mail."}
        </Text>

        <View style={styles.modeSwitch}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === "login" }}
            onPress={() => switchMode("login")}
            style={[styles.modeButton, mode === "login" && styles.modeButtonSelected]}
          >
            <Text style={[styles.modeText, mode === "login" && styles.modeTextSelected]}>
              Connexion
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === "register" }}
            onPress={() => switchMode("register")}
            style={[styles.modeButton, mode === "register" && styles.modeButtonSelected]}
          >
            <Text style={[styles.modeText, mode === "register" && styles.modeTextSelected]}>
              Inscription
            </Text>
          </Pressable>
        </View>

        {mode === "register" ? (
          <>
            <Text style={styles.label}>Prénom(s)</Text>
            <TextInput
              accessibilityLabel="Prénom(s)"
              autoCapitalize="words"
              autoComplete="given-name"
              onChangeText={setFirstName}
              placeholder="Votre prénom"
              placeholderTextColor="#94a3b8"
              style={styles.textInput}
              value={firstName}
            />
            <Text style={styles.label}>Nom</Text>
            <TextInput
              accessibilityLabel="Nom"
              autoCapitalize="words"
              autoComplete="family-name"
              onChangeText={setLastName}
              placeholder="Votre nom"
              placeholderTextColor="#94a3b8"
              style={styles.textInput}
              value={lastName}
            />

            <Text style={styles.label}>Pays avec indicatif</Text>
            <TextInput
              accessibilityLabel="Rechercher un pays"
              autoCapitalize="none"
              onChangeText={setCountrySearch}
              placeholder="Rechercher par pays ou indicatif"
              placeholderTextColor="#94a3b8"
              style={styles.countrySearch}
              value={countrySearch}
            />
            {countryListError && (
              <Text accessibilityRole="alert" style={styles.countryListError}>
                {countryListError}
              </Text>
            )}
            <View style={styles.countryList}>
              {visibleCountries.map((country) => {
                const selected = selectedCountry.code === country.code;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={country.code}
                    onPress={() => {
                      setSelectedCountry(country);
                      setCountrySearch("");
                    }}
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

            <Text style={styles.label}>Téléphone</Text>
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
                style={styles.phoneTextInput}
                value={phone}
              />
            </View>
            <Text style={styles.helper}>
              Le numéro sera enregistré au format international E.164.
            </Text>

            <Text style={styles.label}>E-mail</Text>
            <TextInput
              accessibilityLabel="Adresse e-mail"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="vous@exemple.com"
              placeholderTextColor="#94a3b8"
              style={styles.textInput}
              value={email}
            />

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              onPress={() => setTermsAccepted((accepted) => !accepted)}
              style={styles.consentRow}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={styles.consentText}>
                J’accepte les conditions d’utilisation et la politique de confidentialité.
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>Téléphone avec indicatif ou e-mail</Text>
            <TextInput
              accessibilityLabel="Téléphone avec indicatif ou adresse e-mail"
              autoCapitalize="none"
              autoComplete="username"
              keyboardType="email-address"
              onChangeText={(value) => {
                setIdentifier(value);
                setOfferRegistration(false);
              }}
              placeholder="+226 70 00 00 00 ou vous@exemple.com"
              placeholderTextColor="#94a3b8"
              style={styles.textInput}
              value={identifier}
            />
          </>
        )}

        {otpRequested && (
          <>
            <Text style={styles.label}>Code de vérification</Text>
            <Text style={styles.helper}>
              Un code à six chiffres a été envoyé par SMS au numéro associé à votre compte.
            </Text>
            <TextInput
              accessibilityLabel="Code OTP à six chiffres"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setOtp(value.replace(/\D/g, ""))}
              placeholder="••••••"
              placeholderTextColor="#94a3b8"
              style={[styles.textInput, styles.otpInput]}
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

        {isLoading && (
          <Text style={styles.wakingMessage}>
            Le serveur se réveille… Cela peut prendre jusqu’à une minute.
          </Text>
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
              {otpRequested
                ? "Vérifier et continuer"
                : mode === "register"
                  ? "Créer mon compte et recevoir un code"
                  : "Recevoir un code"}
            </Text>
          )}
        </Pressable>

        {offerRegistration && mode === "login" && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (identifier.includes("@")) setEmail(identifier.trim());
              else if (identifier.trim().startsWith("+")) {
                const matched = countries.find((country) =>
                  identifier.trim().startsWith(country.prefix),
                );
                if (matched) {
                  setSelectedCountry(matched);
                  setPhone(identifier.trim().slice(matched.prefix.length));
                }
              }
              switchMode("register");
            }}
            style={styles.registerOffer}
          >
            <Text style={styles.registerOfferText}>Créer un compte</Text>
          </Pressable>
        )}

        {mode === "login" && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>
            <GoogleAuthScreen />
          </>
        )}
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
  brandMarkText: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  title: { color: "#0f172a", fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { color: "#64748b", fontSize: 15, lineHeight: 22, marginBottom: 22, marginTop: 10, textAlign: "center" },
  modeSwitch: { backgroundColor: "#e2e8f0", borderRadius: 12, flexDirection: "row", marginBottom: 12, padding: 4 },
  modeButton: { alignItems: "center", borderRadius: 9, flex: 1, justifyContent: "center", minHeight: 42 },
  modeButtonSelected: { backgroundColor: "#ffffff" },
  modeText: { color: "#64748b", fontSize: 14, fontWeight: "600" },
  modeTextSelected: { color: "#1d4ed8" },
  label: { color: "#334155", fontSize: 14, fontWeight: "600", marginBottom: 8, marginTop: 14 },
  textInput: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 12, borderWidth: 1, color: "#0f172a", fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  countrySearch: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 10, borderWidth: 1, color: "#0f172a", fontSize: 14, marginBottom: 8, minHeight: 44, paddingHorizontal: 12 },
  countryListError: { color: "#92400e", fontSize: 12, lineHeight: 18, marginBottom: 8 },
  countryList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  countryOption: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  countryOptionSelected: { backgroundColor: "#eff6ff", borderColor: "#2563eb" },
  countryOptionText: { color: "#475569", fontSize: 12 },
  countryOptionTextSelected: { color: "#1d4ed8", fontWeight: "600" },
  phoneInput: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 12, borderWidth: 1, flexDirection: "row", paddingHorizontal: 14 },
  prefix: { color: "#0f172a", fontSize: 16, fontWeight: "600", marginRight: 10 },
  phoneTextInput: { color: "#0f172a", flex: 1, fontSize: 16, minHeight: 52 },
  helper: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 8 },
  consentRow: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 20 },
  checkbox: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#94a3b8", borderRadius: 5, borderWidth: 1, height: 22, justifyContent: "center", width: 22 },
  checkboxChecked: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  checkboxTick: { color: "#ffffff", fontSize: 15, fontWeight: "800", lineHeight: 18 },
  consentText: { color: "#475569", flex: 1, fontSize: 13, lineHeight: 19 },
  otpInput: { fontSize: 22, letterSpacing: 10, textAlign: "center" },
  resend: { color: "#2563eb", fontSize: 14, fontWeight: "600", marginTop: 10, textAlign: "right" },
  disabledText: { color: "#94a3b8" },
  wakingMessage: { color: "#92400e", fontSize: 13, lineHeight: 19, marginTop: 14, textAlign: "center" },
  error: { color: "#b91c1c", fontSize: 14, lineHeight: 20, marginTop: 14 },
  primaryButton: { alignItems: "center", backgroundColor: "#2563eb", borderRadius: 12, justifyContent: "center", marginTop: 22, minHeight: 52, paddingHorizontal: 16 },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700", textAlign: "center" },
  registerOffer: { alignItems: "center", marginTop: 16, minHeight: 42, justifyContent: "center" },
  registerOfferText: { color: "#1d4ed8", fontSize: 15, fontWeight: "700" },
  divider: { alignItems: "center", flexDirection: "row", gap: 12, marginVertical: 22 },
  dividerLine: { backgroundColor: "#e2e8f0", flex: 1, height: 1 },
  dividerText: { color: "#94a3b8", fontSize: 13 },
});
