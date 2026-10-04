import { useEffect, useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { EventSummary, EventsStackParamList } from "../../navigation/types";
import api from "../../services/api";
import { PromoBanner } from "./EventsHomeScreen";

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetail">;
type Navigation = NativeStackNavigationProp<EventsStackParamList, "EventDetail">;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function EventDetailScreen() {
  const route = useRoute<Props["route"]>();
  const navigation = useNavigation<Navigation>();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [promoFreeAccess, setPromoFreeAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.get<{ event: EventSummary }>(`/v1/events/${encodeURIComponent(route.params.eventId)}`, {
        headers: { "Cache-Control": "no-cache" },
      }),
      api.get<{ is_promo_free_access: boolean }>("/v1/monetization/config", {
        headers: { "Cache-Control": "no-cache" },
      }),
    ])
      .then(([eventResponse, configResponse]) => {
        if (!active) return;
        setEvent(eventResponse.data.event);
        setPromoFreeAccess(configResponse.data.is_promo_free_access === true);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Événement indisponible.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route.params.eventId]);

  const buyTicket = async () => {
    if (!event || isBuying) return;
    setIsBuying(true);
    try {
      const response = await api.post<{
        ticket?: { id: string; qr_payload: string };
        payment_url?: string;
        transaction_id?: string;
        already_owned?: boolean;
      }>(`/v1/events/${encodeURIComponent(event.id)}/buy-ticket`);
      if (response.data.ticket) {
        navigation.navigate("MyTickets");
        Alert.alert(
          response.data.already_owned ? "Pass déjà réservé" : "Réservation confirmée",
          "Votre pass sécurisé est disponible dans Mes billets.",
        );
        return;
      }
      if (!response.data.payment_url || !response.data.transaction_id) {
        throw new Error("Le serveur n'a pas renvoyé les informations de paiement du billet.");
      }
      await WebBrowser.openBrowserAsync(response.data.payment_url);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const statusResponse = await api.get<{
          transaction: { status: string };
        }>(`/v1/payments/transactions/${encodeURIComponent(response.data.transaction_id)}`);
        const status = statusResponse.data.transaction.status;
        if (status === "APPROVED") {
          navigation.navigate("MyTickets");
          Alert.alert("Paiement confirmé", "Votre pass sécurisé est disponible dans Mes billets.");
          return;
        }
        if (status === "FAILED" || status === "CANCELED") {
          throw new Error("Le paiement du billet a été refusé ou annulé.");
        }
        await wait(1500);
      }
      Alert.alert(
        "Paiement en vérification",
        "Le billet apparaîtra dans Mes billets dès réception de la confirmation FedaPay.",
      );
    } catch (buyError) {
      Alert.alert(
        "Réservation impossible",
        buyError instanceof Error ? buyError.message : "Une erreur est survenue.",
      );
    } finally {
      setIsBuying(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }
  if (error || !event) {
    return (
      <View style={styles.center}>
        <Text accessibilityRole="alert" style={styles.error}>
          {error ?? "Événement introuvable."}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  const seatsLeft = Math.max(0, event.total_capacity - event.tickets_sold);
  const isFull = seatsLeft === 0;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => navigation.goBack()}>
        <Text style={styles.link}>‹ Retour aux événements</Text>
      </Pressable>
      {promoFreeAccess && <PromoBanner />}
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.date}>
        {new Date(event.event_date).toLocaleString("fr-FR")}
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>Lieu</Text>
        <Text style={styles.value}>{event.location_name}</Text>
        <Text style={[styles.label, styles.spaced]}>À propos</Text>
        <Text style={styles.value}>{event.description || "Aucune description fournie."}</Text>
        <Text style={[styles.label, styles.spaced]}>Billetterie</Text>
        <Text style={styles.price}>
          {Number(event.ticket_price) === 0
            ? "Réservation gratuite"
            : `${Number(event.ticket_price).toLocaleString("fr-FR")} FCFA / billet`}
        </Text>
        <Text style={styles.value}>
          {seatsLeft} place(s) restante(s) sur {event.total_capacity}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={isBuying || isFull}
        onPress={() => void buyTicket()}
        style={[styles.button, (isBuying || isFull) && styles.disabled]}
      >
        {isBuying ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>
            {isFull
              ? "Événement complet"
              : Number(event.ticket_price) === 0
                ? "Réserver mon Pass"
                : "Acheter mon Pass"}
          </Text>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate("MyTickets")}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryText}>Ouvrir Mes billets</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: "#f8fafc", flexGrow: 1, padding: 20, paddingTop: 58 },
  center: { alignItems: "center", backgroundColor: "#f8fafc", flex: 1, justifyContent: "center", padding: 24 },
  title: { color: "#172b4d", fontSize: 26, fontWeight: "800", marginTop: 24 },
  date: { color: "#64748b", fontSize: 14, marginTop: 8 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 13, borderWidth: 1, marginTop: 18, padding: 17 },
  label: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  value: { color: "#172b4d", fontSize: 14, lineHeight: 21, marginTop: 5 },
  spaced: { marginTop: 16 },
  price: { color: "#1d4ed8", fontSize: 17, fontWeight: "800", marginTop: 6 },
  button: { alignItems: "center", backgroundColor: "#2563eb", borderRadius: 10, justifyContent: "center", marginTop: 20, minHeight: 50 },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  secondaryButton: { alignItems: "center", padding: 15 },
  secondaryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },
  error: { color: "#b91c1c", fontSize: 15, marginBottom: 15 },
  link: { color: "#2563eb", fontSize: 14, fontWeight: "600" },
});
