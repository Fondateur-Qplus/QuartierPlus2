import * as Location from "expo-location";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import {
  AlertTriangle,
  MapPin,
  Mic,
  Plus,
  RefreshCw,
  ShoppingBag,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "../context/AuthContext";
import { useVoiceAssistant } from "../context/VoiceAssistantContext";
import {
  cacheAlerts,
  cachePosts,
  getCachedAlerts,
  getCachedPosts,
} from "../services/db";
import { openProfileStore } from "../storage/profileStore";
import { API_BASE_URL, apiFetch } from "../services/api";
import type { MainTabParamList } from "../navigation/types";
import {
  FEED_SCOPES,
  isFeedCoordinates,
  resolveFeedCountryCode,
  type FeedCoordinates,
  type FeedScope,
} from "../services/feedScopes";

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
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { authStatus, isOffline, requestAuthentication, user } = useAuth();
  const { requestAssistant } = useVoiceAssistant();
  const { width: pageWidth } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const [scope, setScope] = useState<FeedScope>("country");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<FeedCoordinates | null>(null);
  const [scopeReady, setScopeReady] = useState(false);
  const [locationInvitation, setLocationInvitation] = useState(false);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<FeedError | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [isServerRequestPending, setIsServerRequestPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let configuredCountryCode: string | null = null;
      try {
        configuredCountryCode = (await (await openProfileStore()).getCountry())
          ?.code ?? null;
      } catch (loadError) {
        console.warn("Unable to read the configured feed country:", loadError);
      }
      const inferredCountryCode = resolveFeedCountryCode({
        userCountryCode: user?.country_code,
        phoneNumber: user?.phone_number,
        deviceLocale: Intl.DateTimeFormat().resolvedOptions().locale,
        configuredCountryCode,
      });
      let knownPosition: FeedCoordinates | null = null;
      if (authStatus !== "guest") {
        try {
          const savedPosition = await SecureStore.getItemAsync(
            "quartierplus.feed.last-position",
          );
          if (savedPosition) {
            const parsed: unknown = JSON.parse(savedPosition);
            if (isFeedCoordinates(parsed)) knownPosition = parsed;
          }
          const permission = await Location.getForegroundPermissionsAsync();
          if (permission.granted) {
            const lastKnown = await Location.getLastKnownPositionAsync();
            if (lastKnown) {
              knownPosition = {
                latitude: lastKnown.coords.latitude,
                longitude: lastKnown.coords.longitude,
              };
            } else if (!knownPosition) {
              const current = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              knownPosition = {
                latitude: current.coords.latitude,
                longitude: current.coords.longitude,
              };
            }
          }
        } catch (locationError) {
          console.warn("Unable to read the last known feed location:", locationError);
        }
      }
      if (cancelled) return;
      setCountryCode(inferredCountryCode);
      setCoordinates(knownPosition);
      setScope(knownPosition && authStatus !== "guest" ? "neighborhood" : "country");
      setLocationInvitation(!knownPosition);
      setScopeReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, user?.country_code, user?.phone_number]);

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

  const movePagerTo = useCallback(
    (nextScope: FeedScope) => {
      const index = FEED_SCOPES.findIndex((option) => option.id === nextScope);
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    },
    [pageWidth],
  );

  const chooseScope = useCallback(
    async (nextScope: FeedScope) => {
      if (nextScope === "neighborhood" || nextScope === "region") {
        if (authStatus === "guest") {
          requestAuthentication();
          movePagerTo(scope);
          return;
        }
        let nextCoordinates = coordinates;
        if (!nextCoordinates) {
          try {
            const permission =
              await Location.requestForegroundPermissionsAsync();
            if (!permission.granted) {
              setScope("country");
              setLocationInvitation(true);
              movePagerTo("country");
              return;
            }
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            nextCoordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            await SecureStore.setItemAsync(
              "quartierplus.feed.last-position",
              JSON.stringify(nextCoordinates),
            );
            setCoordinates(nextCoordinates);
          } catch (locationError) {
            console.warn("Unable to activate location-based feed scope:", locationError);
            setScope("country");
            setLocationInvitation(true);
            movePagerTo("country");
            return;
          }
        }
        if (!nextCoordinates) {
          setScope("country");
          setLocationInvitation(true);
          movePagerTo("country");
          return;
        }
      }
      setScope(nextScope);
      setLocationInvitation(false);
      movePagerTo(nextScope);
    },
    [
      authStatus,
      coordinates,
      movePagerTo,
      requestAuthentication,
      scope,
    ],
  );

  useEffect(() => {
    if (!scopeReady) return;
    const index = FEED_SCOPES.findIndex((option) => option.id === scope);
    pagerRef.current?.scrollTo({ x: index * pageWidth, animated: false });
  }, [pageWidth, scope, scopeReady]);

  useEffect(() => {
    if (!scopeReady || !countryCode) return;
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
              message: "Les publications publiques sont temporairement indisponibles.",
              details: !API_BASE_URL
                ? "EXPO_PUBLIC_API_URL n'est pas configurée."
                : "Le mode invité est hors ligne.",
            });
            return;
          }
          setIsServerRequestPending(true);
          const query = new URLSearchParams({
            scope,
            country_code: countryCode,
          });
          const response = await apiFetch(
            `${API_BASE_URL}/v1/public/marketplace?${query.toString()}`,
            {
            signal: controller.signal,
            timeoutMs: 60_000,
            },
          );
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
        if (
          (scope === "neighborhood" || scope === "region") &&
          !coordinates
        ) {
          if (!cancelled) {
            setScope("country");
            setLocationInvitation(true);
          }
          return;
        }
        const query = new URLSearchParams({ scope, country_code: countryCode });
        if (coordinates && (scope === "neighborhood" || scope === "region")) {
          query.set("latitude", String(coordinates.latitude));
          query.set("longitude", String(coordinates.longitude));
        }

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
            message: "Les publications publiques sont temporairement indisponibles.",
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
              : "Impossible de charger le fil pour le moment. Vérifiez votre connexion puis réessayez.",
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
  }, [
    authStatus,
    countryCode,
    coordinates,
    isOffline,
    loadCachedFeed,
    refreshKey,
    scope,
    scopeReady,
  ]);

  const refresh = () => {
    setIsRefreshing(true);
    setRefreshKey((current) => current + 1);
  };

  const createPublication = () => {
    navigation.navigate("Marche", {
      voiceRequestId: `quick-create-${Date.now()}`,
      voiceCreateListing: true,
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>QUARTIERPLUS</Text>
          <Text style={styles.title}>Fil du quartier</Text>
          <Text style={styles.subtitle}>
            {authStatus === "guest"
              ? "Publications publiques"
              : "Publications et alertes à proximité"}
          </Text>
        </View>
        <View style={styles.scopeBar}>
          {FEED_SCOPES.map((option) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: scope === option.id }}
              key={option.id}
              onPress={() => void chooseScope(option.id)}
              style={[styles.scopeChip, scope === option.id && styles.scopeChipSelected]}
            >
              <Text
                style={[
                  styles.scopeLabel,
                  scope === option.id && styles.scopeLabelSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {locationInvitation && (
          <View style={styles.locationInvitation}>
            <MapPin color="#2563eb" size={18} />
            <View style={styles.invitationCopy}>
              <Text style={styles.invitationText}>
                Activez la localisation pour voir votre quartier
              </Text>
              {authStatus === "guest" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={requestAuthentication}
                >
                  <Text style={styles.invitationAction}>Se connecter</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void Linking.openSettings()}
                >
                  <Text style={styles.invitationAction}>Ouvrir les réglages</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Assistant vocal"
            accessibilityRole="button"
            onPress={requestAssistant}
            style={styles.microphoneButton}
          >
            <Mic color="#475569" size={18} />
          </Pressable>
          <Pressable
            accessibilityLabel="Actualiser le fil"
            accessibilityRole="button"
            onPress={refresh}
            style={styles.refreshButton}
          >
            <RefreshCw color="#2563eb" size={20} />
          </Pressable>
        </View>
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
      <ScrollView
        horizontal
        onMomentumScrollEnd={(event) => {
          const index = Math.round(
            event.nativeEvent.contentOffset.x / pageWidth,
          );
          const nextScope = FEED_SCOPES[index]?.id;
          if (nextScope && nextScope !== scope) void chooseScope(nextScope);
        }}
        pagingEnabled
        ref={pagerRef}
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
      >
        {FEED_SCOPES.map((option) => (
          <View key={option.id} style={[styles.pagerPage, { width: pageWidth }]}>
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
                nestedScrollEnabled
                refreshControl={
                  <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
                }
                style={styles.feedPage}
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
                      Les publications correspondant à la portée sélectionnée apparaîtront ici.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        ))}
      </ScrollView>
      <Pressable
        accessibilityLabel="Créer une annonce avec photo"
        accessibilityRole="button"
        onPress={createPublication}
        style={styles.createButton}
      >
        <Plus color="#ffffff" size={28} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f1f5f9", flex: 1, paddingTop: 54 },
  pager: { flex: 1 },
  pagerPage: { flex: 1 },
  feedPage: { flex: 1 },
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
  headerActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  microphoneButton: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  scopeBar: {
    backgroundColor: "#ffffff",
    flexDirection: "row",
    gap: 5,
    justifyContent: "space-around",
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  scopeChip: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  scopeChipSelected: { backgroundColor: "#dbeafe" },
  scopeLabel: { color: "#64748b", fontSize: 11, fontWeight: "600" },
  scopeLabelSelected: { color: "#1d4ed8" },
  locationInvitation: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 14,
    marginTop: 10,
    padding: 12,
  },
  invitationCopy: { flex: 1, gap: 4 },
  invitationText: { color: "#334155", fontSize: 12, lineHeight: 18 },
  invitationAction: { color: "#1d4ed8", fontSize: 12, fontWeight: "700" },
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
  createButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#0f766e",
    borderColor: "#ffffff",
    borderRadius: 30,
    borderWidth: 2,
    bottom: 16,
    elevation: 8,
    height: 58,
    justifyContent: "center",
    position: "absolute",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    width: 58,
    zIndex: 5,
  },
});
