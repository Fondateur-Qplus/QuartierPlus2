import * as Location from "expo-location";
import { AlertTriangle, MapPin, RefreshCw, ShoppingBag } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import {
  cacheAlerts,
  cachePosts,
  getCachedAlerts,
  getCachedPosts,
} from "../services/db";
import { API_BASE_URL, apiFetch } from "../services/api";

type FeedEntry = {
  id: string;
  kind: "post" | "alert";
  title: string;
  body: string;
  location: string;
  createdAt: string;
  category: string;
  price?: string;
};

type FeedError = {
  message: string;
  details: string;
};

class FeedHttpError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(
      status === 401
        ? "Votre session a expiré. Reconnectez-vous puis réessayez."
        : status === 404
          ? "La ressource du fil est introuvable. Réessayez dans un instant."
          : status >= 500
            ? "Le serveur rencontre une erreur. Réessayez dans un instant."
            : `Le chargement a échoué (HTTP ${status}). Réessayez.`,
    );
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordsFrom = (payload: unknown, key: string) => {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload[key])) return payload[key];
  throw new Error(`La réponse ${key} du fil est invalide.`);
};

const normalizePost = (value: unknown): FeedEntry | null => {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? "");
  const title = String(value.title ?? value.name ?? "");
  if (!id || !title) return null;
  const free = value.is_free === true || value.isFree === true;
  const price = value.price;
  return {
    id,
    kind: "post",
    title,
    body: String(value.description ?? ""),
    location: String(value.neighborhood ?? value.location_name ?? ""),
    createdAt: String(value.created_at ?? value.createdAt ?? ""),
    category: String(value.category ?? "Annonce"),
    price:
      free
        ? "Gratuit / Don"
        : price === undefined || price === null
          ? undefined
          : `${new Intl.NumberFormat("fr-FR").format(Number(price))} FCFA`,
  };
};

const normalizeAlert = (value: unknown): FeedEntry | null => {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? value.sos_id ?? "");
  const title = String(
    value.title ?? value.emergency_type ?? value.category ?? "Alerte communautaire",
  );
  if (!id) return null;
  const coords = isRecord(value.coordinates)
    ? value.coordinates
    : isRecord(value.location)
      ? value.location
      : value;
  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);
  const coordinateLabel =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
      : "";
  return {
    id,
    kind: "alert",
    title,
    body: String(value.description ?? value.message ?? "Signalement actif dans le quartier."),
    location: coordinateLabel,
    createdAt: String(value.created_at ?? value.createdAt ?? ""),
    category: String(value.category ?? value.emergency_type ?? "Urgence"),
  };
};

const sortEntries = (entries: FeedEntry[]) =>
  [...entries].sort((left, right) => {
    const leftDate = Date.parse(left.createdAt);
    const rightDate = Date.parse(right.createdAt);
    if (!Number.isFinite(leftDate)) return 1;
    if (!Number.isFinite(rightDate)) return -1;
    return rightDate - leftDate;
  });

const formatDate = (date: string) => {
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp)
    : "Publication récente";
};

export default function FeedScreen() {
  const { authStatus, isOffline } = useAuth();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [isServerRequestPending, setIsServerRequestPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCachedFeed = useCallback(async () => {
    const [posts, alerts] = await Promise.all([
      getCachedPosts<unknown[]>(),
      getCachedAlerts<unknown[]>(),
    ]);
    const cachedPosts = posts.map(normalizePost).filter(
      (entry): entry is FeedEntry => entry !== null,
    );
    const cachedAlerts = alerts.map(normalizeAlert).filter(
      (entry): entry is FeedEntry => entry !== null,
    );
    setEntries(sortEntries([...cachedPosts, ...cachedAlerts]));
    return cachedPosts.length + cachedAlerts.length;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const loadFeed = async () => {
      setError(null);
      setShowTechnicalDetails(false);
      setIsServerRequestPending(false);
      try {
        if (authStatus === "guest") {
          if (!API_BASE_URL || isOffline) {
            setEntries([]);
            setError({
              message: "Les annonces publiques seront disponibles dès que la connexion sera rétablie.",
              details: "Mode invité hors ligne ou URL API absente.",
            });
            return;
          }
          setIsServerRequestPending(true);
          const response = await apiFetch(`${API_BASE_URL}/v1/public/marketplace`, {
            signal: controller.signal,
            timeoutMs: 60_000,
          });
          if (!cancelled) setIsServerRequestPending(false);
          if (!response.ok) {
            throw new FeedHttpError("/v1/public/marketplace", response.status);
          }
          const payload: unknown = await response.json();
          const rawPosts = recordsFrom(payload, "items");
          const posts = rawPosts.map(normalizePost).filter(
            (entry): entry is FeedEntry => entry !== null,
          );
          if (!cancelled) setEntries(sortEntries(posts));
          return;
        }
        if (!API_BASE_URL) {
          throw new Error("L'adresse du serveur n'est pas configurée.");
        }
        const cachedCount = await loadCachedFeed();
        if (isOffline) {
          if (!cancelled) {
            setError({
              message: cachedCount > 0
                ? "Mode hors ligne : affichage des données enregistrées sur cet appareil."
                : "Mode hors ligne : aucune publication ou alerte n'a encore été mise en cache.",
              details: "NetInfo signale une absence de connexion Internet.",
            });
          }
          return;
        }
        if (!cancelled && cachedCount > 0) setIsLoading(false);
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          throw new Error("Autorisez la localisation pour charger le fil de proximité.");
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const query = new URLSearchParams({
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          radius_m: "30000",
        });

        setIsServerRequestPending(true);
        const [postsResponse, alertsResponse] = await Promise.all([
          apiFetch(
            `${API_BASE_URL}/v1/public/marketplace?${query.toString()}`,
            { signal: controller.signal, timeoutMs: 60_000 },
          ),
          apiFetch(
            `${API_BASE_URL}/v1/sos/alerts?${query.toString()}`,
            { signal: controller.signal, timeoutMs: 60_000 },
          ),
        ]);
        if (!cancelled) setIsServerRequestPending(false);
        if (!postsResponse.ok) {
          throw new FeedHttpError(
            "/v1/public/marketplace",
            postsResponse.status,
          );
        }
        if (!alertsResponse.ok) {
          throw new FeedHttpError(
            "/v1/sos/alerts",
            alertsResponse.status,
          );
        }

        const [postsPayload, alertsPayload] = await Promise.all([
          postsResponse.json(),
          alertsResponse.json(),
        ]);
        const rawPosts = recordsFrom(postsPayload, "items");
        const rawAlerts = recordsFrom(alertsPayload, "alerts");
        const posts = rawPosts.map(normalizePost).filter(
          (entry): entry is FeedEntry => entry !== null,
        );
        const alerts = rawAlerts.map(normalizeAlert).filter(
          (entry): entry is FeedEntry => entry !== null,
        );
        await Promise.all([cachePosts(rawPosts), cacheAlerts(rawAlerts)]);
        if (!cancelled) setEntries(sortEntries([...posts, ...alerts]));
      } catch (loadError) {
        if (cancelled || controller.signal.aborted) return;
        if (authStatus === "guest") {
          setEntries([]);
          setError({
            message:
              loadError instanceof Error
                ? loadError.message
                : "Les annonces publiques sont temporairement indisponibles.",
            details:
              loadError instanceof FeedHttpError
                ? `${loadError.path} — HTTP ${loadError.status}`
                : loadError instanceof Error
                  ? loadError.message
                  : "Erreur réseau inconnue.",
          });
          return;
        }
        let cachedCount = 0;
        try {
          cachedCount = await loadCachedFeed();
        } catch (cacheError) {
          console.error("Unable to read the local neighborhood feed:", cacheError);
        }
        setError({
          message:
            cachedCount > 0
              ? "Connexion indisponible : affichage du fil enregistré sur cet appareil."
              : loadError instanceof Error
                ? loadError.message
                : "Impossible de charger le fil du quartier.",
          details:
            loadError instanceof FeedHttpError
              ? `${loadError.path} — HTTP ${loadError.status}`
              : loadError instanceof Error
                ? loadError.message
                : "Erreur réseau inconnue.",
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsServerRequestPending(false);
        }
      }
    };
    void loadFeed();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authStatus, isOffline, loadCachedFeed, refreshKey]);

  const refresh = () => {
    setIsRefreshing(true);
    setRefreshKey((current) => current + 1);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>QUARTIERPLUS</Text>
          <Text style={styles.title}>Fil du quartier</Text>
          <Text style={styles.subtitle}>
            {authStatus === "guest" ? "Annonces publiques du quartier" : "Publications et alertes à proximité"}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Actualiser le fil"
          accessibilityRole="button"
          onPress={refresh}
          style={styles.refreshButton}
        >
          <RefreshCw color="#2563eb" size={20} />
        </Pressable>
      </View>
      {error && (
        <View style={[styles.notice, entries.length ? styles.cachedNotice : styles.errorNotice]}>
          <Text style={styles.noticeText}>{error.message}</Text>
          <Pressable accessibilityRole="button" onPress={refresh}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showTechnicalDetails }}
            onPress={() => setShowTechnicalDetails((shown) => !shown)}
          >
            <Text style={styles.detailsToggle}>
              {showTechnicalDetails ? "Masquer les détails" : "Détails techniques"}
            </Text>
          </Pressable>
          {showTechnicalDetails && (
            <Text selectable style={styles.technicalDetails}>
              {error.details}
            </Text>
          )}
        </View>
      )}
      {isLoading && entries.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#2563eb" size="large" />
          <Text style={styles.loadingText}>
            {isServerRequestPending
              ? "Le serveur se réveille…"
              : "Chargement du fil local…"}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
          }
        >
          {entries.map((entry) => (
            <View key={`${entry.kind}:${entry.id}`} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.icon, entry.kind === "alert" && styles.alertIcon]}>
                  {entry.kind === "alert" ? (
                    <AlertTriangle color="#dc2626" size={19} />
                  ) : (
                    <ShoppingBag color="#2563eb" size={19} />
                  )}
                </View>
                <View style={styles.cardHeading}>
                  <Text style={styles.category}>{entry.category}</Text>
                  <Text style={styles.date}>{formatDate(entry.createdAt)}</Text>
                </View>
                {entry.price ? <Text style={styles.price}>{entry.price}</Text> : null}
              </View>
              <Text style={styles.cardTitle}>{entry.title}</Text>
              {entry.body ? <Text style={styles.body}>{entry.body}</Text> : null}
              {entry.location ? (
                <View style={styles.location}>
                  <MapPin color="#64748b" size={14} />
                  <Text style={styles.locationText}>{entry.location}</Text>
                </View>
              ) : null}
            </View>
          ))}
          {!entries.length && !isLoading && (
            <View style={styles.empty}>
              <MapPin color="#94a3b8" size={30} />
              <Text style={styles.emptyTitle}>Rien à signaler pour le moment</Text>
              <Text style={styles.emptyText}>
                Les annonces et les alertes de votre quartier apparaîtront ici.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f1f5f9", flex: 1, paddingTop: 54 },
  header: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  eyebrow: { color: "#2563eb", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#0f172a", fontSize: 24, fontWeight: "800", marginTop: 3 },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 3 },
  refreshButton: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  notice: { marginHorizontal: 14, marginTop: 10, padding: 11, borderRadius: 10, gap: 8 },
  cachedNotice: { backgroundColor: "#eff6ff" },
  errorNotice: { backgroundColor: "#fef2f2" },
  noticeText: { color: "#334155", fontSize: 12, lineHeight: 18 },
  retryText: { color: "#1d4ed8", fontSize: 13, fontWeight: "700" },
  detailsToggle: { color: "#475569", fontSize: 12, textDecorationLine: "underline" },
  technicalDetails: { color: "#64748b", fontSize: 11, lineHeight: 16 },
  list: { gap: 12, padding: 14, paddingBottom: 112 },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
  },
  cardHeader: { alignItems: "center", flexDirection: "row" },
  icon: { alignItems: "center", backgroundColor: "#eff6ff", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  alertIcon: { backgroundColor: "#fef2f2" },
  cardHeading: { flex: 1, marginLeft: 10 },
  category: { color: "#475569", fontSize: 12, fontWeight: "700" },
  date: { color: "#94a3b8", fontSize: 11, marginTop: 3 },
  price: { color: "#15803d", fontSize: 12, fontWeight: "700", marginLeft: 8 },
  cardTitle: { color: "#0f172a", fontSize: 17, fontWeight: "700", marginTop: 13 },
  body: { color: "#475569", fontSize: 14, lineHeight: 21, marginTop: 6 },
  location: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 11 },
  locationText: { color: "#64748b", fontSize: 12 },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  loadingText: { color: "#64748b", fontSize: 14, marginTop: 12 },
  empty: { alignItems: "center", paddingHorizontal: 25, paddingTop: 65 },
  emptyTitle: { color: "#334155", fontSize: 17, fontWeight: "700", marginTop: 14 },
  emptyText: { color: "#64748b", fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: "center" },
});
