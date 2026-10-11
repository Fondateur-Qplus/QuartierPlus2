import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
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
import api from "../../services/api";
import { PROMO_FREE_ACCESS_BANNER } from "../../config/monetization";
import type { EventSummary, EventsStackParamList } from "../../navigation/types";

type Navigation = NativeStackNavigationProp<EventsStackParamList, "EventsHome">;

const readError = (error: unknown) =>
  error instanceof Error ? error.message : "Une erreur est survenue.";

export default function EventsHomeScreen() {
  const navigation = useNavigation<Navigation>();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoFreeAccess, setPromoFreeAccess] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [ticketPrice, setTicketPrice] = useState("0");
  const [capacity, setCapacity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [eventResponse, configResponse] = await Promise.all([
        api.get<{ events: EventSummary[] }>("/v1/events", {
          headers: { "Cache-Control": "no-cache" },
        }),
        api.get<{ is_promo_free_access: boolean }>("/v1/monetization/config", {
          headers: { "Cache-Control": "no-cache" },
        }),
      ]);
      setEvents(eventResponse.data.events);
      setPromoFreeAccess(configResponse.data.is_promo_free_access === true);
    } catch (loadError) {
      setError(readError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents]),
  );

  const createEvent = async () => {
    const parsedDate = Date.parse(eventDate);
    const parsedPrice = Number(ticketPrice);
    const parsedCapacity = Number(capacity);
    const hasCoordinates = Boolean(latitude.trim() || longitude.trim());
    if (
      !title.trim() ||
      !locationName.trim() ||
      !Number.isFinite(parsedDate) ||
      !Number.isSafeInteger(parsedPrice) ||
      parsedPrice < 0 ||
      !Number.isSafeInteger(parsedCapacity) ||
      parsedCapacity < 1 ||
      (hasCoordinates &&
        (!Number.isFinite(Number(latitude)) ||
          !Number.isFinite(Number(longitude))))
    ) {
      Alert.alert(
        "Informations invalides",
        "Saisissez un titre, un lieu, une date future, un tarif et une capacité valides.",
      );
      return;
    }
    setIsCreating(true);
    try {
      const response = await api.post<{ event: EventSummary }>("/v1/events", {
        title: title.trim(),
        description: description.trim(),
        location_name: locationName.trim(),
        event_date: new Date(parsedDate).toISOString(),
        ticket_price: parsedPrice,
        total_capacity: parsedCapacity,
        ...(hasCoordinates
          ? { latitude: Number(latitude), longitude: Number(longitude) }
          : {}),
      });
      setTitle("");
      setDescription("");
      setLocationName("");
      setEventDate("");
      setTicketPrice("0");
      setCapacity("");
      setLatitude("");
      setLongitude("");
      await loadEvents();
      navigation.navigate("EventDetail", { eventId: response.data.event.id });
      Alert.alert("Événement publié", "Votre événement est visible dans la billetterie.");
    } catch (createError) {
      Alert.alert("Création impossible", readError(createError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Événements</Text>
      <Text style={styles.subtitle}>
        Découvrez les rendez-vous du quartier et gérez vos billets.
      </Text>
      {promoFreeAccess && <PromoBanner />}
      <View style={styles.actionRow}>
        <ActionButton
          label="Mes billets"
          onPress={() => navigation.navigate("MyTickets")}
        />
        <ActionButton
          label="Scanner les entrées"
          onPress={() => navigation.navigate("OrganizerScanner")}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Créer un événement</Text>
        <Text style={styles.help}>
          La création est réservée aux organisateurs Alliance Pro; pendant la période
          découverte, l’accès Pro est offert.
        </Text>
        <Field label="Titre" value={title} onChangeText={setTitle} maxLength={200} />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={10000}
        />
        <Field
          label="Lieu"
          value={locationName}
          onChangeText={setLocationName}
          maxLength={200}
        />
        <Field
          label="Date et heure (ex. 2026-12-31T18:00)"
          value={eventDate}
          onChangeText={setEventDate}
          autoCapitalize="none"
        />
        <View style={styles.inputRow}>
          <Field
            label="Prix (FCFA)"
            value={ticketPrice}
            onChangeText={setTicketPrice}
            keyboardType="number-pad"
            compact
          />
          <Field
            label="Capacité"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
            compact
          />
        </View>
        <View style={styles.inputRow}>
          <Field
            label="Latitude (facultatif)"
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="decimal-pad"
            compact
          />
          <Field
            label="Longitude (facultatif)"
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="decimal-pad"
            compact
          />
        </View>
        <ActionButton
          label={isCreating ? "Publication…" : "Publier l’événement"}
          onPress={() => void createEvent()}
          disabled={isCreating}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>À venir</Text>
        <Pressable accessibilityRole="button" onPress={() => void loadEvents()}>
          <Text style={styles.link}>Actualiser</Text>
        </Pressable>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {isLoading ? (
        <ActivityIndicator color="#2563eb" style={styles.loader} />
      ) : events.length ? (
        events.map((event) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            onPress={() => navigation.navigate("EventDetail", { eventId: event.id })}
            style={styles.card}
          >
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.help}>
              {new Date(event.event_date).toLocaleString("fr-FR")}
            </Text>
            <Text style={styles.help}>{event.location_name}</Text>
            <Text style={styles.price}>
              {Number(event.ticket_price) === 0
                ? "Gratuit"
                : `${Number(event.ticket_price).toLocaleString("fr-FR")} FCFA`}
              {" · "}
              {Math.max(0, event.total_capacity - event.tickets_sold)} place(s) restante(s)
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.help}>Aucun événement publié pour le moment.</Text>
      )}
    </ScrollView>
  );
}

export function PromoBanner() {
  return (
    <View accessibilityRole="summary" style={styles.promoBanner}>
      <Text style={styles.promoText}>{PROMO_FREE_ACCESS_BANNER}</Text>
    </View>
  );
}

function Field({
  label,
  compact = false,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        style={[styles.input, props.multiline && styles.multiline, props.style]}
      />
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: "#f8fafc", flexGrow: 1, padding: 18, paddingBottom: 112, paddingTop: 56 },
  title: { color: "#172b4d", fontSize: 25, fontWeight: "800" },
  subtitle: { color: "#64748b", fontSize: 14, lineHeight: 20, marginTop: 6 },
  promoBanner: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  promoText: { color: "#166534", fontSize: 14, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 13,
    borderWidth: 1,
    marginTop: 12,
    padding: 15,
  },
  sectionTitle: { color: "#172b4d", fontSize: 17, fontWeight: "700" },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
  },
  eventTitle: { color: "#172b4d", fontSize: 17, fontWeight: "700" },
  help: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 5 },
  price: { color: "#1d4ed8", fontSize: 13, fontWeight: "700", marginTop: 9 },
  label: { color: "#334155", fontSize: 12, fontWeight: "600", marginBottom: 5 },
  field: { flex: 1, marginTop: 11 },
  compactField: { minWidth: 100 },
  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#172b4d",
    minHeight: 43,
    paddingHorizontal: 10,
  },
  multiline: { minHeight: 78, paddingTop: 10, textAlignVertical: "top" },
  button: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    marginTop: 11,
    minHeight: 43,
    paddingHorizontal: 12,
  },
  buttonText: { color: "#ffffff", fontSize: 12, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.6 },
  link: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  error: { color: "#b91c1c", fontSize: 13, marginTop: 12 },
  loader: { marginTop: 20 },
});
