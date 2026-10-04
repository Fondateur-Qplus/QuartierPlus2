import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { ArrowLeft, CheckCircle2, CreditCard, MapPin, ShieldCheck } from "lucide-react-native";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import type { RootStackParamList } from "../../navigation/types";
import { API_BASE_URL, apiFetch } from "../../services/api";

type Offer =
  | "ALLIANCE_PRO"
  | "SPONSORED_PIN"
  | "SYNDIC"
  | "TOWN_HALL"
  | "SECURITY_AGENT";

const OFFERS: {
  id: Offer;
  title: string;
  description: string;
  price: string;
}[] = [
  {
    id: "ALLIANCE_PRO",
    title: "Alliance Pro",
    description: "Badge Commerçant Certifié et outils professionnels",
    price: "5 000 FCFA / mois",
  },
  {
    id: "SPONSORED_PIN",
    title: "Épingle sponsorisée",
    description: "Votre commerce mis en avant sur la carte radar · 7 jours",
    price: "2 000 FCFA / semaine",
  },
  {
    id: "SYNDIC",
    title: "Syndic",
    description: "Mur privé, votes de copropriété et annuaire des artisans",
    price: "2 500 FCFA / mois",
  },
  {
    id: "TOWN_HALL",
    title: "Mairie",
    description: "Signalements cartographiés, consultations et fil officiel",
    price: "75 000 FCFA / mois",
  },
  {
    id: "SECURITY_AGENT",
    title: "Accès Certifié Secours",
    description: "Prise en charge SOS, guidage GPS et alertes de proximité",
    price: "50 000 FCFA / mois",
  },
];

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const readError = async (response: Awaited<ReturnType<typeof apiFetch>>) => {
  const payload: unknown = await response.json();
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : `La demande a échoué (HTTP ${response.status}).`;
};

export default function CheckoutScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { refreshUser } = useAuth();
  const [offer, setOffer] = useState<Offer>("ALLIANCE_PRO");
  const [pinTitle, setPinTitle] = useState("");
  const [pinLocation, setPinLocation] =
    useState<Location.LocationObjectCoords | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  const selectOffer = async (nextOffer: Offer) => {
    setOffer(nextOffer);
    if (nextOffer !== "SPONSORED_PIN" || pinLocation) return;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Position requise",
          "Autorisez l'accès à la position pour placer votre épingle sponsorisée.",
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPinLocation(position.coords);
    } catch (error) {
      Alert.alert(
        "Position indisponible",
        error instanceof Error
          ? error.message
          : "Impossible d'obtenir votre position GPS.",
      );
    }
  };

  const startPayment = async () => {
    if (!API_BASE_URL || isPaying) {
      if (!API_BASE_URL) {
        Alert.alert(
          "Service indisponible",
          "L'adresse du serveur n'est pas configurée (EXPO_PUBLIC_API_URL).",
        );
      }
      return;
    }
    if (offer === "SPONSORED_PIN" && (!pinTitle.trim() || !pinLocation)) {
      Alert.alert(
        "Informations manquantes",
        "Saisissez le nom de votre commerce et autorisez sa localisation.",
      );
      return;
    }

    setIsPaying(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/v1/payments/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_type: offer,
          ...(offer === "SPONSORED_PIN"
            ? {
                pin: {
                  title: pinTitle.trim(),
                  latitude: pinLocation?.latitude,
                  longitude: pinLocation?.longitude,
                },
              }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload: unknown = await response.json();
      if (
        !payload ||
        typeof payload !== "object" ||
        !("transaction_id" in payload) ||
        typeof payload.transaction_id !== "string" ||
        !("payment_url" in payload) ||
        typeof payload.payment_url !== "string" ||
        !/^https:\/\/[^\s]+$/i.test(payload.payment_url)
      ) {
        throw new Error("Le serveur a renvoyé un lien de paiement invalide.");
      }

      await WebBrowser.openBrowserAsync(payload.payment_url);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const statusResponse = await apiFetch(
          `${API_BASE_URL}/v1/payments/transactions/${encodeURIComponent(payload.transaction_id)}`,
        );
        if (!statusResponse.ok) throw new Error(await readError(statusResponse));
        const statusPayload: unknown = await statusResponse.json();
        const transaction =
          statusPayload &&
          typeof statusPayload === "object" &&
          "transaction" in statusPayload &&
          statusPayload.transaction &&
          typeof statusPayload.transaction === "object"
            ? statusPayload.transaction
            : null;
        if (transaction && "status" in transaction) {
          if (transaction.status === "APPROVED") {
            setIsPaid(true);
            await refreshUser();
            return;
          }
          if (transaction.status === "FAILED" || transaction.status === "CANCELED") {
            throw new Error("Le paiement a été refusé ou annulé.");
          }
        }
        await wait(3000);
      }
      Alert.alert(
        "Paiement en cours de vérification",
        "Nous actualiserons votre offre dès que FedaPay aura confirmé le paiement.",
      );
    } catch (error) {
      Alert.alert(
        "Paiement impossible",
        error instanceof Error ? error.message : "Une erreur est survenue.",
      );
    } finally {
      setIsPaying(false);
    }
  };

  if (isPaid) {
    return (
      <View style={styles.successScreen}>
        <CheckCircle2 color="#16a34a" size={58} />
        <Text style={styles.successTitle}>Paiement confirmé</Text>
        <Text style={styles.subtitle}>
          {offer === "SPONSORED_PIN"
            ? "Votre épingle sponsorisée est visible sur la carte pour 7 jours."
            : `Votre abonnement ${OFFERS.find(({ id }) => id === offer)?.title} est activé pour 30 jours.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate("Main", {
              screen: offer === "SPONSORED_PIN" ? "CarteSOS" : "EspacePro",
            })
          }
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {offer === "SPONSORED_PIN" ? "Voir la carte radar" : "Ouvrir mon espace Pro"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <ArrowLeft color="#334155" size={20} />
        <Text style={styles.backText}>Retour au profil</Text>
      </Pressable>
      <Text style={styles.title}>Choisissez votre offre</Text>
      <Text style={styles.subtitle}>
        Activez votre présence professionnelle dans votre quartier.
      </Text>

      {OFFERS.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: offer === item.id }}
          onPress={() => void selectOffer(item.id)}
          style={[styles.offerCard, offer === item.id && styles.selectedOffer]}
        >
          {item.id === "SPONSORED_PIN" ? (
            <MapPin color="#ea580c" size={26} />
          ) : (
            <ShieldCheck color="#2563eb" size={26} />
          )}
          <View style={styles.offerCopy}>
            <Text style={styles.offerTitle}>{item.title}</Text>
            <Text style={styles.offerDescription}>{item.description}</Text>
            <Text style={styles.price}>{item.price}</Text>
          </View>
        </Pressable>
      ))}

      {offer === "SPONSORED_PIN" && (
        <View style={styles.pinForm}>
          <Text style={styles.inputLabel}>Nom affiché sur la carte</Text>
          <TextInput
            accessibilityLabel="Nom affiché sur la carte"
            maxLength={150}
            onChangeText={setPinTitle}
            placeholder="Ex. Boulangerie du quartier"
            style={styles.input}
            value={pinTitle}
          />
          <Text style={styles.locationHint}>
            {pinLocation
              ? `Position GPS : ${pinLocation.latitude.toFixed(4)}, ${pinLocation.longitude.toFixed(4)}`
              : "La position GPS est nécessaire pour afficher l'épingle."}
          </Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={isPaying}
        onPress={() => void startPayment()}
        style={[styles.primaryButton, isPaying && styles.disabledButton]}
      >
        {isPaying ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <CreditCard color="#ffffff" size={19} />
            <Text style={styles.primaryButtonText}>
              Payer avec FedaPay (Mobile Money / Carte Visa)
            </Text>
          </>
        )}
      </Pressable>
      <Text style={styles.secureNote}>
        Vous serez redirigé vers la page sécurisée de FedaPay. L'offre n'est activée
        qu'après confirmation du paiement.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: "#f8fafc", flexGrow: 1, padding: 20, paddingTop: 56 },
  backButton: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 24 },
  backText: { color: "#334155", fontSize: 14, fontWeight: "600" },
  title: { color: "#172b4d", fontSize: 25, fontWeight: "800" },
  subtitle: { color: "#64748b", fontSize: 14, lineHeight: 21, marginTop: 8 },
  offerCard: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    marginTop: 18,
    padding: 16,
  },
  selectedOffer: { borderColor: "#2563eb", borderWidth: 2 },
  offerCopy: { flex: 1 },
  offerTitle: { color: "#172b4d", fontSize: 16, fontWeight: "700" },
  offerDescription: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 4 },
  price: { color: "#1d4ed8", fontSize: 14, fontWeight: "700", marginTop: 9 },
  pinForm: { marginTop: 18 },
  inputLabel: { color: "#334155", fontSize: 13, fontWeight: "600", marginBottom: 7 },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    color: "#172b4d",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  locationHint: { color: "#64748b", fontSize: 12, marginTop: 8 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 11,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  secureNote: { color: "#64748b", fontSize: 11, lineHeight: 17, marginTop: 12 },
  successScreen: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  successTitle: { color: "#172b4d", fontSize: 24, fontWeight: "800", marginTop: 16 },
});
